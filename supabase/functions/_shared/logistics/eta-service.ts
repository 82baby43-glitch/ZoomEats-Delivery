import type { SupabaseClient } from "@supabase/supabase-js";
import type { DriverRouteState, GeoPoint } from "../routing/types";
import { ROUTING_CONFIG } from "../routing/types";
import { getAdaptiveSpeedKmh } from "../routing/eta-engine";
import { haversineKm } from "../routing/geo";
import { buildTrafficSegment } from "../routing/traffic-ai";
import {
  deriveLiveDeliveryPhase,
  type LiveDeliveryPhase,
} from "./route-state-helpers.ts";

const KM_TO_MILES = 0.621371;
const KMH_TO_MPH = 0.621371;

export type IntelligentEtaInput = {
  orderId: string;
  orderStatus: string;
  driverPos: GeoPoint | null;
  restaurant: GeoPoint;
  customer: GeoPoint;
  driverId?: string;
  routeState?: DriverRouteState | null;
  /** Live speed from GPS stream (km/h) */
  speedKmh?: number | null;
  historicalAvgMin?: number | null;
};

export type IntelligentEtaResult = {
  eta_pickup_min: number | null;
  eta_dropoff_min: number | null;
  estimated_arrival_min: number | null;
  remaining_distance_km: number;
  remaining_distance_miles: number;
  current_speed_kmh: number;
  current_speed_mph: number;
  live_status: LiveDeliveryPhase;
  eta_message: string | null;
  customer_eta_message: string | null;
  confidence: number;
  used_historical_blend: boolean;
};

function kmToMiles(km: number): number {
  return Math.round(km * KM_TO_MILES * 10) / 10;
}

function kmhToMph(kmh: number): number {
  return Math.round(kmh * KMH_TO_MPH);
}

function isPickedUp(status: string): boolean {
  return ["picked_up", "out_for_delivery", "delivered"].includes(status);
}

function remainingLegDistanceKm(
  driverPos: GeoPoint | null,
  restaurant: GeoPoint,
  customer: GeoPoint,
  orderStatus: string,
  routeState?: DriverRouteState | null
): number {
  if (routeState?.remaining_stops?.length && driverPos) {
    let total = 0;
    let prev = driverPos;
    for (const stop of routeState.remaining_stops) {
      if (stop.completed) continue;
      total += haversineKm(prev, { lat: stop.lat, lng: stop.lng });
      prev = { lat: stop.lat, lng: stop.lng };
    }
    if (total > 0) return total;
  }

  if (!driverPos) return 0;

  if (isPickedUp(orderStatus)) {
    return haversineKm(driverPos, customer);
  }

  const toRestaurant = haversineKm(driverPos, restaurant);
  const restaurantToCustomer = haversineKm(restaurant, customer);
  return toRestaurant + restaurantToCustomer;
}

function resolveSpeedKmh(
  driverId: string | undefined,
  liveSpeedKmh?: number | null,
  distanceKm?: number,
  historicalAvgMin?: number | null
): number {
  if (liveSpeedKmh != null && liveSpeedKmh > 3) return Math.min(80, liveSpeedKmh);
  if (driverId) {
    const adaptive = getAdaptiveSpeedKmh(driverId);
    if (adaptive > ROUTING_CONFIG.BASE_SPEED_KMH * 0.5) return adaptive;
  }
  if (distanceKm && historicalAvgMin && historicalAvgMin > 0) {
    const implied = (distanceKm / historicalAvgMin) * 60;
    if (implied >= 12 && implied <= 55) return implied;
  }
  return ROUTING_CONFIG.BASE_SPEED_KMH;
}

function travelMinutes(
  distanceKm: number,
  speedKmh: number,
  from: GeoPoint,
  to: GeoPoint,
  driverId?: string
): number {
  if (distanceKm <= 0) return 0;
  const segment = buildTrafficSegment(from, to, {
    driverSpeedHistory: driverId ? undefined : undefined,
  });
  return (distanceKm / speedKmh) * 60 * segment.multiplier;
}

function blendEta(calculated: number, historical: number | null | undefined, weightCalc = 0.75): number {
  if (historical == null || historical <= 0) return calculated;
  const blended = calculated * weightCalc + historical * (1 - weightCalc);
  return Math.max(1, Math.round(blended));
}

function buildCustomerEtaMessage(
  phase: LiveDeliveryPhase,
  etaMin: number | null,
  miles: number
): string | null {
  if (phase === "delivered") return "Your order has been delivered";
  if (phase === "pending") return "Your order is being prepared";
  if (etaMin == null) return "Your driver is on the way";
  if (phase === "picking_up") {
    return `Your driver is approximately ${etaMin} minute${etaMin === 1 ? "" : "s"} from the restaurant`;
  }
  if (phase === "arriving_soon") {
    return `Your driver is approximately ${etaMin} minute${etaMin === 1 ? "" : "s"} away`;
  }
  if (miles > 0 && miles < 5) {
    return `Your driver is approximately ${etaMin} minute${etaMin === 1 ? "" : "s"} away (${miles} mi)`;
  }
  return `Your driver is approximately ${etaMin} minute${etaMin === 1 ? "" : "s"} away`;
}

function buildDriverEtaMessage(
  phase: LiveDeliveryPhase,
  etaMin: number | null,
  miles: number,
  mph: number
): string | null {
  if (etaMin == null) return null;
  if (phase === "picking_up") {
    return `${miles} mi to restaurant · ${mph} mph · ~${etaMin} min`;
  }
  return `${miles} mi away · ${mph} mph · ~${etaMin} min arrival`;
}

/**
 * Intelligent ETA — uses live GPS, route distance, driver speed, traffic, and historical delivery times.
 */
export function calculateIntelligentEta(input: IntelligentEtaInput): IntelligentEtaResult {
  const {
    orderStatus,
    driverPos,
    restaurant,
    customer,
    driverId,
    routeState,
    speedKmh: liveSpeed,
    historicalAvgMin,
  } = input;

  const remainingKm = remainingLegDistanceKm(
    driverPos,
    restaurant,
    customer,
    orderStatus,
    routeState
  );
  const remainingMiles = kmToMiles(remainingKm);

  const speedKmh = resolveSpeedKmh(driverId, liveSpeed, remainingKm, historicalAvgMin);
  const speedMph = kmhToMph(speedKmh);

  let etaPickup: number | null = null;
  let etaDropoff: number | null = null;
  let usedHistorical = false;

  if (driverPos && restaurant.lat && restaurant.lng) {
    if (!isPickedUp(orderStatus)) {
      const distToRest = haversineKm(driverPos, restaurant);
      const calcPickup = travelMinutes(distToRest, speedKmh, driverPos, restaurant, driverId);
      etaPickup = blendEta(Math.max(1, Math.round(calcPickup)), null);
    }

    if (customer.lat && customer.lng) {
      let calcDropoff: number;
      if (isPickedUp(orderStatus)) {
        const dist = haversineKm(driverPos, customer);
        calcDropoff = travelMinutes(dist, speedKmh, driverPos, customer, driverId);
      } else {
        const toRest = haversineKm(driverPos, restaurant);
        const restToCust = haversineKm(restaurant, customer);
        calcDropoff =
          travelMinutes(toRest, speedKmh, driverPos, restaurant, driverId) +
          ROUTING_CONFIG.PICKUP_WAIT_MIN +
          travelMinutes(restToCust, speedKmh, restaurant, customer, driverId);
      }

      const raw = Math.max(1, Math.round(calcDropoff));
      if (historicalAvgMin != null) {
        etaDropoff = blendEta(raw, historicalAvgMin, isPickedUp(orderStatus) ? 0.85 : 0.7);
        usedHistorical = true;
      } else {
        etaDropoff = raw;
      }
    }
  } else if (routeState?.total_eta_minutes) {
    etaDropoff = Math.max(1, Math.round(routeState.total_eta_minutes));
  } else if (historicalAvgMin != null) {
    etaDropoff = historicalAvgMin;
    usedHistorical = true;
  }

  const estimatedArrival = isPickedUp(orderStatus) ? etaDropoff : etaDropoff;
  const phase = deriveLiveDeliveryPhase(orderStatus, estimatedArrival);

  const confidence =
    driverPos && liveSpeed != null
      ? 0.92
      : driverPos
        ? 0.78
        : historicalAvgMin != null
          ? 0.55
          : 0.4;

  const customer_eta_message = buildCustomerEtaMessage(phase, estimatedArrival, remainingMiles);
  const eta_message = buildDriverEtaMessage(phase, estimatedArrival, remainingMiles, speedMph);

  return {
    eta_pickup_min: etaPickup,
    eta_dropoff_min: etaDropoff,
    estimated_arrival_min: estimatedArrival,
    remaining_distance_km: Math.round(remainingKm * 100) / 100,
    remaining_distance_miles: remainingMiles,
    current_speed_kmh: Math.round(speedKmh * 10) / 10,
    current_speed_mph: speedMph,
    live_status: phase,
    eta_message,
    customer_eta_message,
    confidence: Math.round(confidence * 100) / 100,
    used_historical_blend: usedHistorical,
  };
}

/** Historical average minutes from placed → delivered for a restaurant. */
export async function fetchHistoricalDeliveryMinutes(
  db: SupabaseClient,
  restaurantId: string
): Promise<number | null> {
  if (!restaurantId) return null;

  const { data: snapshots } = await db
    .from("order_eta_snapshots")
    .select("eta_dropoff_min,created_at")
    .not("eta_dropoff_min", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const { data: orders } = await db
    .from("orders")
    .select("created_at,updated_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "delivered")
    .order("updated_at", { ascending: false })
    .limit(40);

  const samples: number[] = [];

  for (const o of orders || []) {
    const start = new Date(String(o.created_at)).getTime();
    const end = new Date(String(o.updated_at)).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const min = Math.round((end - start) / 60000);
    if (min >= 8 && min <= 90) samples.push(min);
  }

  for (const s of snapshots || []) {
    const min = Number(s.eta_dropoff_min);
    if (min >= 3 && min <= 60) samples.push(min);
  }

  if (!samples.length) {
    const { data: rest } = await db
      .from("restaurants")
      .select("delivery_time_min")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    const fallback = Number(rest?.delivery_time_min);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }

  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2
    ? samples[mid]
    : Math.round((samples[mid - 1] + samples[mid]) / 2);
}

export async function calculateIntelligentEtaForOrder(
  db: SupabaseClient,
  input: Omit<IntelligentEtaInput, "historicalAvgMin"> & { restaurantId?: string }
): Promise<IntelligentEtaResult> {
  const historicalAvgMin = input.restaurantId
    ? await fetchHistoricalDeliveryMinutes(db, input.restaurantId)
    : null;
  return calculateIntelligentEta({ ...input, historicalAvgMin });
}
