import type { SupabaseClient } from "@supabase/supabase-js";
import { metersBetween } from "../routing/geo";
import type { GeoPoint } from "../routing/types";

/** ~152 m */
export const ARRIVING_SOON_FEET = 500;
/** ~30 m */
export const ARRIVED_FEET = 100;

const METERS_TO_FEET = 3.28084;

const APPROACH_ORDER_STATUSES = new Set([
  "assigned_internal",
  "assigned_uber",
  "ready",
  "accepted",
  "confirmed",
  "preparing",
]);

export type DriverApproachPhase = "arriving_soon" | "arrived";

export type DriverApproachAlert = {
  order_id: string;
  phase: DriverApproachPhase;
  message: string;
  distance_feet: number;
  driver_name: string;
  vehicle_type: string;
  driver_lat: number;
  driver_lng: number;
  eta_pickup_min?: number;
  severity: "info" | "success";
};

export function kmToFeet(km: number): number {
  return Math.round(km * 1000 * METERS_TO_FEET);
}

export function distanceFeetBetween(a: GeoPoint, b: GeoPoint): number {
  return Math.round(metersBetween(a, b) * METERS_TO_FEET);
}

export function formatVehicleLabel(row: {
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_year?: number | null;
} | null): string {
  if (!row) return "Car";
  const parts = [
    row.vehicle_color,
    row.vehicle_year ? String(row.vehicle_year) : null,
    row.vehicle_make,
    row.vehicle_model,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "Car";
}

export async function fetchDriverVehicleLabel(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await db
    .from("driver_onboarding")
    .select("vehicle_make,vehicle_model,vehicle_color,vehicle_year")
    .eq("user_id", userId)
    .maybeSingle();
  return formatVehicleLabel(data);
}

export function computeDriverApproachAlert(input: {
  order_id: string;
  order_status: string;
  driver_name: string;
  vehicle_type: string;
  driver_pos: GeoPoint | null;
  restaurant: GeoPoint;
  eta_pickup_min?: number;
}): DriverApproachAlert | null {
  const { order_status, driver_pos, restaurant } = input;

  if (!APPROACH_ORDER_STATUSES.has(order_status)) return null;
  if (!driver_pos || !restaurant.lat || !restaurant.lng) return null;
  if (!driver_pos.lat || !driver_pos.lng) return null;

  const distanceFeet = distanceFeetBetween(driver_pos, restaurant);

  if (distanceFeet <= ARRIVED_FEET) {
    return {
      order_id: input.order_id,
      phase: "arrived",
      message: "Driver has arrived",
      distance_feet: distanceFeet,
      driver_name: input.driver_name,
      vehicle_type: input.vehicle_type,
      driver_lat: driver_pos.lat,
      driver_lng: driver_pos.lng,
      eta_pickup_min: input.eta_pickup_min,
      severity: "success",
    };
  }

  if (distanceFeet <= ARRIVING_SOON_FEET) {
    return {
      order_id: input.order_id,
      phase: "arriving_soon",
      message: "Your ZoomEats driver is arriving soon",
      distance_feet: distanceFeet,
      driver_name: input.driver_name,
      vehicle_type: input.vehicle_type,
      driver_lat: driver_pos.lat,
      driver_lng: driver_pos.lng,
      eta_pickup_min: input.eta_pickup_min,
      severity: "info",
    };
  }

  return null;
}
