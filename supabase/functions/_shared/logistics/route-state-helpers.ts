import type { DriverRouteState, GeoPoint, RouteStop } from "../routing/types";
import { haversineKm } from "../routing/geo";
import { calculateIntelligentEta } from "./eta-service.ts";
import type { RoutePolyline } from "./types.ts";

export type LiveDeliveryPhase = "picking_up" | "en_route" | "arriving_soon" | "delivered" | "pending";

export type OrderRoutingIntel = {
  eta_pickup_min: number | null;
  eta_dropoff_min: number | null;
  estimated_arrival_min?: number | null;
  remaining_distance_km?: number;
  remaining_distance_miles?: number;
  current_speed_mph?: number;
  customer_eta_message?: string | null;
  confidence?: number;
  used_historical_blend?: boolean;
  live_status: LiveDeliveryPhase;
  driver_heading_deg?: number;
  speed_kmh?: number;
  route_polyline: Array<[number, number]>;
  remaining_stops: RouteStop[];
};

export function deriveLiveDeliveryPhase(
  orderStatus: string,
  etaDropoffMin?: number | null
): LiveDeliveryPhase {
  if (orderStatus === "delivered") return "delivered";
  if (["placed", "confirmed", "accepted", "preparing"].includes(orderStatus)) return "pending";
  if (["ready", "assigned_internal", "assigned_uber"].includes(orderStatus)) return "picking_up";
  if (etaDropoffMin != null && etaDropoffMin <= 3) return "arriving_soon";
  if (["picked_up", "out_for_delivery"].includes(orderStatus)) return "en_route";
  return "pending";
}

export function liveStatusLabel(phase: LiveDeliveryPhase): string {
  const map: Record<LiveDeliveryPhase, string> = {
    picking_up: "Picking Up Food",
    en_route: "En Route",
    arriving_soon: "Arriving Soon",
    delivered: "Delivered",
    pending: "Preparing",
  };
  return map[phase] ?? "En Route";
}

function stopsForOrder(stops: RouteStop[], orderId: string): RouteStop[] {
  return stops.filter((s) => s.order_id === orderId && !s.completed);
}

function buildPolylineFromStops(
  start: GeoPoint | null,
  stops: RouteStop[],
  restaurant: GeoPoint,
  customer: GeoPoint,
  orderStatus: string
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const origin = start ?? restaurant;
  points.push([origin.lat, origin.lng]);

  if (stops.length) {
    for (const s of stops) {
      points.push([s.lat, s.lng]);
    }
    return points;
  }

  const picked = ["picked_up", "out_for_delivery", "delivered"].includes(orderStatus);
  if (!picked && restaurant.lat && restaurant.lng) {
    points.push([restaurant.lat, restaurant.lng]);
  }
  if (customer.lat && customer.lng) {
    points.push([customer.lat, customer.lng]);
  }
  return points;
}

export function computeOrderRoutingIntel(
  routeState: DriverRouteState | null,
  orderId: string,
  orderStatus: string,
  driverPos: GeoPoint | null,
  restaurant: GeoPoint,
  customer: GeoPoint,
  driverId?: string,
  historicalAvgMin?: number | null
): OrderRoutingIntel {
  const remaining = routeState?.remaining_stops ?? [];
  const orderStops = stopsForOrder(remaining, orderId);
  const loc = routeState?.current_location;
  const speedKmh = loc?.speed_mps != null ? Math.round(loc.speed_mps * 3.6 * 10) / 10 : undefined;
  const heading = loc?.heading_deg;

  const intel = calculateIntelligentEta({
    orderId,
    orderStatus,
    driverPos,
    restaurant,
    customer,
    driverId,
    routeState,
    speedKmh,
    historicalAvgMin,
  });

  const route_polyline = buildPolylineFromStops(
    driverPos,
    orderStops,
    restaurant,
    customer,
    orderStatus
  );

  return {
    eta_pickup_min: intel.eta_pickup_min,
    eta_dropoff_min: intel.eta_dropoff_min,
    estimated_arrival_min: intel.estimated_arrival_min,
    remaining_distance_km: intel.remaining_distance_km,
    remaining_distance_miles: intel.remaining_distance_miles,
    current_speed_mph: intel.current_speed_mph,
    customer_eta_message: intel.customer_eta_message,
    confidence: intel.confidence,
    used_historical_blend: intel.used_historical_blend,
    live_status: intel.live_status,
    driver_heading_deg: heading,
    speed_kmh: speedKmh ?? intel.current_speed_kmh,
    route_polyline,
    remaining_stops: orderStops,
  };
}

export function buildRoutesFromRouteState(
  routeState: DriverRouteState | null,
  driverPos: GeoPoint | null,
  orders: Array<Record<string, unknown>>
): RoutePolyline[] {
  if (routeState?.current_route?.length && driverPos) {
    const points: Array<[number, number]> = [[driverPos.lat, driverPos.lng]];
    for (const s of routeState.remaining_stops) {
      if (!s.completed) points.push([s.lat, s.lng]);
    }
    if (points.length > 1) {
      return [{ id: "active-route", kind: "full", color: "#C2533B", points }];
    }
  }
  const routes: RoutePolyline[] = [];
  for (const o of orders) {
    const rLat = Number(o.restaurant_lat);
    const rLng = Number(o.restaurant_lng);
    const cLat = Number(o.customer_lat);
    const cLng = Number(o.customer_lng);
    if (!rLat || !rLng || !cLat || !cLng) continue;
    const start = driverPos || { lat: rLat, lng: rLng };
    routes.push({
      id: `${o.order_id}-pickup`,
      kind: "pickup",
      color: "#D49A36",
      points: [[start.lat, start.lng], [rLat, rLng]],
    });
    routes.push({
      id: `${o.order_id}-delivery`,
      kind: "delivery",
      color: "#C2533B",
      points: [[rLat, rLng], [cLat, cLng]],
    });
  }
  return routes;
}

export function remainingDistanceKm(
  routeState: DriverRouteState | null,
  driverPos: GeoPoint | null
): number {
  if (routeState?.total_distance_km) return Math.round(routeState.total_distance_km * 10) / 10;
  if (!driverPos || !routeState?.remaining_stops?.length) return 0;
  let total = 0;
  let prev = driverPos;
  for (const s of routeState.remaining_stops) {
    if (s.completed) continue;
    total += haversineKm(prev, { lat: s.lat, lng: s.lng });
    prev = { lat: s.lat, lng: s.lng };
  }
  return Math.round(total * 10) / 10;
}
