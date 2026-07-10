import type { SupabaseClient } from "@supabase/supabase-js";
import { createRoutingDbAdapter } from "../routing/db-adapter.ts";
import { mergePickupGuide } from "../pickupPhotos/instructions.ts";
import {
  fetchDefaultEstimateMinutes,
  fetchHistoricalDeliveryMinutes,
} from "./eta-service.ts";
import { computeOrderRoutingIntel } from "./route-state-helpers.ts";
import type { LogisticsMarker, RoutePolyline } from "./types.ts";

const ACTIVE_NAV_STATUSES = [
  "assigned_internal",
  "assigned_uber",
  "picked_up",
  "out_for_delivery",
  "ready",
];

export type DriverNavigationPhase = "to_restaurant" | "to_customer";

export type DriverNavigationView = {
  order_id: string;
  driver_id: string;
  status: string;
  phase: DriverNavigationPhase;
  position: { lat: number; lng: number } | null;
  heading_deg?: number;
  speed_kmh?: number;
  restaurant: {
    name: string;
    address?: string;
    lat: number;
    lng: number;
  };
  customer: {
    name: string;
    address?: string;
    lat: number;
    lng: number;
  };
  markers: LogisticsMarker[];
  routes: RoutePolyline[];
  eta_min: number;
  eta_pickup_min?: number | null;
  eta_dropoff_min?: number | null;
  remaining_distance_miles?: number;
  delivery_notes: string[];
  updated_at: string;
};

function navigationPhase(status: string): DriverNavigationPhase {
  return ["picked_up", "out_for_delivery"].includes(status) ? "to_customer" : "to_restaurant";
}

function buildDeliveryNotes(
  order: Record<string, unknown>,
  guide: ReturnType<typeof mergePickupGuide>,
  phase: DriverNavigationPhase
): string[] {
  const notes: string[] = [];

  if (order.address) notes.push(`Dropoff: ${String(order.address)}`);
  if (order.notes) notes.push(String(order.notes));

  if (phase === "to_restaurant") {
    if (guide.entrance_instructions) notes.push(`Entrance: ${guide.entrance_instructions}`);
    if (guide.parking_instructions) notes.push(`Parking: ${guide.parking_instructions}`);
    if (guide.counter_instructions) notes.push(`Counter: ${guide.counter_instructions}`);
    if (guide.shelf_location) notes.push(`Shelf: ${guide.shelf_location}`);
  }

  if (guide.pickup_notes) notes.push(guide.pickup_notes);

  const items = order.items as Array<{ name?: string; notes?: string }> | undefined;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it.notes) notes.push(`${it.name || "Item"}: ${it.notes}`);
    }
  }

  return [...new Set(notes.filter(Boolean))];
}

export async function buildDriverNavigationView(
  db: SupabaseClient,
  userId: string,
  orderId?: string
): Promise<DriverNavigationView | null> {
  const { data: driver } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
  if (!driver?.driver_id) return null;

  let orderQuery = db
    .from("orders")
    .select("*")
    .eq("driver_id", driver.driver_id)
    .in("status", ACTIVE_NAV_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);

  if (orderId) {
    orderQuery = db.from("orders").select("*").eq("order_id", orderId).eq("driver_id", driver.driver_id).limit(1);
  }

  const { data: order } = await orderQuery.maybeSingle();
  if (!order) return null;

  const { data: restaurant } = order.restaurant_id
    ? await db
        .from("restaurants")
        .select("restaurant_id,name,address,latitude,longitude")
        .eq("restaurant_id", order.restaurant_id)
        .maybeSingle()
    : { data: null };

  const { data: guideRow } = order.restaurant_id
    ? await db.from("restaurant_pickup_guides").select("*").eq("restaurant_id", order.restaurant_id).maybeSingle()
    : { data: null };

  const restaurantPt = {
    lat: Number(restaurant?.latitude ?? order.restaurant_lat ?? 0),
    lng: Number(restaurant?.longitude ?? order.restaurant_lng ?? 0),
  };
  const customerPt = {
    lat: Number(order.customer_lat ?? 0),
    lng: Number(order.customer_lng ?? 0),
  };

  const position =
    driver.latitude && driver.longitude
      ? { lat: Number(driver.latitude), lng: Number(driver.longitude) }
      : null;

  const adapter = createRoutingDbAdapter(db);
  const routeState = await adapter.getDriverState(String(driver.driver_id));
  const heading = routeState?.current_location?.heading_deg;
  const speedKmh =
    routeState?.current_location?.speed_mps != null
      ? Math.round(routeState.current_location.speed_mps * 3.6 * 10) / 10
      : undefined;

  const [historicalAvgMin, defaultEstimateMin] = await Promise.all([
    order.restaurant_id
      ? fetchHistoricalDeliveryMinutes(db, String(order.restaurant_id))
      : Promise.resolve(null),
    order.restaurant_id
      ? fetchDefaultEstimateMinutes(db, String(order.restaurant_id))
      : Promise.resolve(25),
  ]);

  const intel = computeOrderRoutingIntel(
    routeState,
    String(order.order_id),
    String(order.status),
    position,
    restaurantPt,
    customerPt,
    String(driver.driver_id),
    historicalAvgMin,
    defaultEstimateMin
  );

  const phase = navigationPhase(String(order.status));
  const etaMin =
    phase === "to_customer"
      ? intel.estimated_arrival_min ?? intel.eta_dropoff_min ?? 0
      : intel.eta_pickup_min ?? intel.estimated_arrival_min ?? 0;

  const markers: LogisticsMarker[] = [];
  if (position) {
    markers.push({
      id: "driver",
      type: "driver",
      lat: position.lat,
      lng: position.lng,
      label: "You",
      meta: { heading_deg: heading, speed_kmh: speedKmh },
    });
  }
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
      label: String(order.customer_name || "Customer"),
    });
  }

  const routes: RoutePolyline[] =
    intel.route_polyline.length > 1
      ? [{ id: "nav-route", kind: "full", color: "#C2533B", points: intel.route_polyline }]
      : [];

  const guide = mergePickupGuide(
    String(restaurant?.name || order.restaurant_name || "Restaurant"),
    guideRow
  );

  return {
    order_id: String(order.order_id),
    driver_id: String(driver.driver_id),
    status: String(order.status),
    phase,
    position,
    heading_deg: heading,
    speed_kmh: speedKmh,
    restaurant: {
      name: String(restaurant?.name || order.restaurant_name || "Restaurant"),
      address: restaurant?.address ? String(restaurant.address) : undefined,
      lat: restaurantPt.lat,
      lng: restaurantPt.lng,
    },
    customer: {
      name: String(order.customer_name || "Customer"),
      address: order.address ? String(order.address) : undefined,
      lat: customerPt.lat,
      lng: customerPt.lng,
    },
    markers,
    routes,
    eta_min: etaMin,
    eta_pickup_min: intel.eta_pickup_min,
    eta_dropoff_min: intel.eta_dropoff_min ?? intel.estimated_arrival_min,
    remaining_distance_miles: intel.remaining_distance_miles,
    delivery_notes: buildDeliveryNotes(order, guide, phase),
    updated_at: new Date().toISOString(),
  };
}
