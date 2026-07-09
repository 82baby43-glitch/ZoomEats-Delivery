import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveOrderRef, DriverRouteState } from "./types";
import type { RoutingDbAdapter } from "./uber-routing-ai";
import { haversineKm } from "./geo";

/** Supabase persistence adapter for routing state (used by API + edge). */
export function createRoutingDbAdapter(db: SupabaseClient): RoutingDbAdapter {
  return {
    async getDriverState(driverId: string): Promise<DriverRouteState | null> {
      const { data } = await db
        .from("driver_route_states")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();
      if (!data) return null;
      return {
        driver_id: data.driver_id,
        active_orders: data.active_orders ?? [],
        current_location: data.current_location ?? { lat: 0, lng: 0 },
        current_route: data.current_route ?? [],
        remaining_stops: data.remaining_stops ?? [],
        total_eta_minutes: Number(data.total_eta_minutes ?? 0),
        total_distance_km: Number(data.total_distance_km ?? 0),
        last_reroute_timestamp: data.last_reroute_timestamp,
        fallback_mode: data.fallback_mode ?? false,
        last_good_route: data.last_good_route ?? undefined,
        earnings_per_hour_estimate: data.earnings_per_hour_estimate ?? undefined,
      };
    },

    async saveDriverState(state: DriverRouteState): Promise<void> {
      await db.from("driver_route_states").upsert({
        driver_id: state.driver_id,
        active_orders: state.active_orders,
        current_location: state.current_location,
        current_route: state.current_route,
        remaining_stops: state.remaining_stops,
        total_eta_minutes: state.total_eta_minutes,
        total_distance_km: state.total_distance_km,
        last_reroute_timestamp: state.last_reroute_timestamp,
        fallback_mode: state.fallback_mode ?? false,
        last_good_route: state.last_good_route ?? null,
        earnings_per_hour_estimate: state.earnings_per_hour_estimate ?? null,
        updated_at: new Date().toISOString(),
      });
    },

    async logMetric(row: Record<string, unknown>): Promise<void> {
      await db.from("routing_metrics_log").insert(row);
    },

    async getOrderCoords(orderId: string): Promise<ActiveOrderRef | null> {
      const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
      if (!order) return null;

      const { data: restaurant } = order.restaurant_id
        ? await db.from("restaurants").select("latitude, longitude, name").eq("restaurant_id", order.restaurant_id).maybeSingle()
        : { data: null };

      const pickupLat = restaurant?.latitude ?? order.customer_lat ?? 0;
      const pickupLng = restaurant?.longitude ?? order.customer_lng ?? 0;
      const dropLat = order.customer_lat ?? pickupLat;
      const dropLng = order.customer_lng ?? pickupLng;

      const pickup = { lat: Number(pickupLat) || 0, lng: Number(pickupLng) || 0 };
      const dropoff = { lat: Number(dropLat) || 0, lng: Number(dropLng) || 0 };

      return {
        order_id: order.order_id,
        restaurant_id: order.restaurant_id,
        restaurant_name: order.restaurant_name ?? restaurant?.name,
        pickup,
        dropoff,
        priority: order.priority ?? 0,
        status: order.status,
        picked_up: order.status === "picked_up",
        estimated_weight_lbs: order.estimated_weight_lbs ?? undefined,
        bag_count: order.bag_count ?? undefined,
        large_drink_count: order.large_drink_count ?? undefined,
        delivery_distance_km: order.delivery_distance_km ?? haversineKm(pickup, dropoff),
        required_vehicle_class: order.required_vehicle_class ?? undefined,
        special_handling: order.special_handling ?? undefined,
      };
    },
  };
}
