import type { SupabaseClient } from "@supabase/supabase-js";
import type { DriverRouteState } from "../dispatch/routing/types";
import { createRoutingDbAdapter } from "../dispatch/routing/db-adapter";
import type { LogisticsMarker, RoutePolyline } from "./types";
import {
  computeOrderRoutingIntel,
  liveStatusLabel,
  type LiveDeliveryPhase,
  type OrderRoutingIntel,
} from "./route-state-helpers";
import { fetchHistoricalDeliveryMinutes } from "./eta-service";
import { persistOrderEtaSnapshot } from "./gps-persistence";

export type CustomerTrackingRouting = OrderRoutingIntel & {
  live_status_label: string;
  eta_message: string | null;
  driver_name?: string;
};

export type CustomerTrackingView = {
  routing: CustomerTrackingRouting;
  markers: LogisticsMarker[];
  routes: RoutePolyline[];
  route_history: Array<{ route_points: Array<[number, number]>; created_at: string }>;
};

const ACTIVE_TRACKING = [
  "ready", "assigned_internal", "assigned_uber", "picked_up", "out_for_delivery",
];

async function loadRouteState(db: SupabaseClient, driverId: string): Promise<DriverRouteState | null> {
  const adapter = createRoutingDbAdapter(db);
  return adapter.getDriverState(driverId);
}

function buildEtaMessage(
  phase: LiveDeliveryPhase,
  routing: OrderRoutingIntel
): string | null {
  if (routing.customer_eta_message) return routing.customer_eta_message;
  const etaDropoff = routing.estimated_arrival_min ?? routing.eta_dropoff_min;
  if (phase === "delivered") return "Your order has been delivered";
  if (phase === "pending") return "Your order is being prepared";
  if (etaDropoff == null) return "Your driver is on the way";
  return `Your driver is approximately ${etaDropoff} minute${etaDropoff === 1 ? "" : "s"} away`;
}

export async function buildCustomerTrackingView(
  db: SupabaseClient,
  order: Record<string, unknown>,
  driver: { driver_id: string; latitude?: number; longitude?: number; last_seen?: string } | null,
  restaurant: { name?: string; latitude?: number; longitude?: number; address?: string } | null,
  options: { persistSnapshot?: boolean } = {}
): Promise<CustomerTrackingView | null> {
  const status = String(order.status || "");
  if (!ACTIVE_TRACKING.includes(status) && status !== "delivered") return null;

  const restaurantPt = {
    lat: Number(restaurant?.latitude ?? order.restaurant_lat ?? 0),
    lng: Number(restaurant?.longitude ?? order.restaurant_lng ?? 0),
  };
  const customerPt = {
    lat: Number(order.customer_lat ?? 0),
    lng: Number(order.customer_lng ?? 0),
  };
  let driverPos: { lat: number; lng: number } | null =
    driver?.latitude && driver?.longitude
      ? { lat: Number(driver.latitude), lng: Number(driver.longitude) }
      : null;

  let routeState: DriverRouteState | null = null;
  if (driver?.driver_id) {
    routeState = await loadRouteState(db, driver.driver_id);
    if (!driverPos && routeState?.current_location?.lat) {
      driverPos = {
        lat: routeState.current_location.lat,
        lng: routeState.current_location.lng,
      };
    }
  }

  const historicalAvgMin = order.restaurant_id
    ? await fetchHistoricalDeliveryMinutes(db, String(order.restaurant_id))
    : null;

  const routingIntel = computeOrderRoutingIntel(
    routeState,
    String(order.order_id),
    status,
    driverPos,
    restaurantPt,
    customerPt,
    driver?.driver_id,
    historicalAvgMin
  );

  let driverName: string | undefined;
  if (driver?.driver_id) {
    const { data: drv } = await db.from("drivers").select("user_id").eq("driver_id", driver.driver_id).maybeSingle();
    if (drv?.user_id) {
      const { data: u } = await db.from("users").select("name").eq("user_id", drv.user_id).maybeSingle();
      driverName = u?.name ? String(u.name) : "Driver";
    }
  }

  const routing: CustomerTrackingRouting = {
    ...routingIntel,
    live_status_label: liveStatusLabel(routingIntel.live_status),
    eta_message: buildEtaMessage(routingIntel.live_status, routingIntel),
    driver_name: driverName,
  };

  const markers: LogisticsMarker[] = [];
  if (restaurantPt.lat && restaurantPt.lng) {
    markers.push({
      id: "restaurant",
      type: "restaurant",
      lat: restaurantPt.lat,
      lng: restaurantPt.lng,
      label: String(restaurant?.name || order.restaurant_name || "Restaurant"),
    });
  }
  if (customerPt.lat && customerPt.lng) {
    markers.push({
      id: "customer",
      type: "customer",
      lat: customerPt.lat,
      lng: customerPt.lng,
      label: "Your location",
    });
  }
  if (driverPos) {
    markers.push({
      id: "driver",
      type: "driver",
      lat: driverPos.lat,
      lng: driverPos.lng,
      label: driverName || "Driver",
      meta: {
        heading_deg: routingIntel.driver_heading_deg,
        speed_kmh: routingIntel.speed_kmh,
      },
    });
  }

  const routes: RoutePolyline[] = routingIntel.route_polyline.length > 1
    ? [{ id: "delivery-route", kind: "full", color: "#C2533B", points: routingIntel.route_polyline }]
    : [];

  const { data: history } = await db
    .from("delivery_route_history")
    .select("route_points,created_at")
    .eq("order_id", String(order.order_id))
    .order("created_at", { ascending: false })
    .limit(5);

  if (options.persistSnapshot && driver?.driver_id) {
    await persistOrderEtaSnapshot(
      db,
      String(order.order_id),
      driver.driver_id,
      driverPos?.lat ?? null,
      driverPos?.lng ?? null,
      routingIntel
    );
  }

  return {
    routing,
    markers,
    routes,
    route_history: (history || []).map((h) => ({
      route_points: (h.route_points as Array<[number, number]>) || [],
      created_at: String(h.created_at),
    })),
  };
}
