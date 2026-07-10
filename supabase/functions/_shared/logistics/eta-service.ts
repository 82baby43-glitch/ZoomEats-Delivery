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

/** Level 4 default when no GPS, speed profile, or history exists. */
export const DEFAULT_ETA_MIN = 25;

/** Slow urban crawl — used for physics upper bound (route truly needs long ETA). */
const MIN_PHYSICS_SPEED_KMH = 14;
/** Highway-ish ceiling for physics lower bound. */
const MAX_PHYSICS_SPEED_KMH = 72;

export type EtaFallbackLevel = 1 | 2 | 3 | 4;

export const ETA_FALLBACK_LABELS: Record<EtaFallbackLevel, string> = {
  1: "live_gps",
  2: "average_driver_speed",
  3: "historical_delivery_time",
  4: "default_estimate",
};

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
  /** Restaurant default delivery_time_min — level 4 */
  defaultEstimateMin?: number | null;
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
  fallback_level: EtaFallbackLevel;
  fallback_source: string;
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

function hasValidPoint(p: GeoPoint): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0);
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

  if (driverPos && hasValidPoint(driverPos)) {
    if (isPickedUp(orderStatus) && hasValidPoint(customer)) {
      return haversineKm(driverPos, customer);
    }
    if (hasValidPoint(restaurant) && hasValidPoint(customer)) {
      const toRestaurant = haversineKm(driverPos, restaurant);
      const restaurantToCustomer = haversineKm(restaurant, customer);
      return toRestaurant + restaurantToCustomer;
    }
  }

  if (hasValidPoint(restaurant) && hasValidPoint(customer)) {
    return haversineKm(restaurant, customer);
  }

  return 0;
}

function travelMinutes(
  distanceKm: number,
  speedKmh: number,
  from: GeoPoint,
  to: GeoPoint
): number {
  if (distanceKm <= 0 || speedKmh <= 0) return 0;
  const segment = buildTrafficSegment(from, to, {});
  return (distanceKm / speedKmh) * 60 * segment.multiplier;
}

/** Physics-based ETA window — values outside this range are unrealistic for the distance. */
export function physicsEtaBounds(
  distanceKm: number,
  includePickupWait: boolean
): { min_min: number; max_min: number } {
  if (distanceKm <= 0) {
    const base = includePickupWait ? ROUTING_CONFIG.PICKUP_WAIT_MIN : 1;
    return { min_min: 1, max_min: Math.max(3, base + 2) };
  }

  const pickup = includePickupWait ? ROUTING_CONFIG.PICKUP_WAIT_MIN : 0;
  const minMin = Math.max(1, Math.ceil((distanceKm / MAX_PHYSICS_SPEED_KMH) * 60));
  const maxMin = Math.ceil((distanceKm / MIN_PHYSICS_SPEED_KMH) * 60 * 1.2) + pickup;
  return { min_min: minMin, max_min: Math.max(minMin + 1, maxMin) };
}

/**
 * Clamp ETA to a realistic window for the route distance.
 * Prevents spurious values like "100 minutes" on a 2-mile delivery.
 */
export function clampEtaToRealistic(
  etaMin: number,
  distanceKm: number,
  includePickupWait: boolean
): number {
  const { min_min, max_min } = physicsEtaBounds(distanceKm, includePickupWait);

  if (distanceKm < 0.8) {
    return Math.min(Math.max(Math.round(etaMin), 1), Math.min(max_min, 12));
  }

  const rounded = Math.round(etaMin);
  if (rounded < min_min) return min_min;
  if (rounded > max_min) return max_min;
  return rounded;
}

function computeEtaFromDriverGps(
  driverPos: GeoPoint,
  restaurant: GeoPoint,
  customer: GeoPoint,
  orderStatus: string,
  speedKmh: number
): number {
  if (!hasValidPoint(customer)) return 0;

  if (isPickedUp(orderStatus)) {
    const dist = haversineKm(driverPos, customer);
    return travelMinutes(dist, speedKmh, driverPos, customer);
  }

  if (!hasValidPoint(restaurant)) return 0;

  const toRest = haversineKm(driverPos, restaurant);
  const restToCust = haversineKm(restaurant, customer);
  return (
    travelMinutes(toRest, speedKmh, driverPos, restaurant) +
    ROUTING_CONFIG.PICKUP_WAIT_MIN +
    travelMinutes(restToCust, speedKmh, restaurant, customer)
  );
}

function level4DefaultEta(
  distanceKm: number,
  includePickupWait: boolean,
  defaultEstimateMin?: number | null
): number {
  const distanceBased =
    distanceKm > 0
      ? travelMinutes(
          distanceKm,
          ROUTING_CONFIG.BASE_SPEED_KMH,
          { lat: 0, lng: 0 },
          { lat: 1, lng: 1 }
        ) + (includePickupWait ? ROUTING_CONFIG.PICKUP_WAIT_MIN : 0)
      : 0;

  const baseline = defaultEstimateMin ?? DEFAULT_ETA_MIN;
  const raw = distanceKm > 0
    ? Math.round((distanceBased + baseline) / 2)
    : baseline;

  return clampEtaToRealistic(raw, distanceKm || 8, includePickupWait);
}

type ResolveDropoffParams = {
  driverPos: GeoPoint | null;
  restaurant: GeoPoint;
  customer: GeoPoint;
  orderStatus: string;
  driverId?: string;
  liveSpeed?: number | null;
  historicalAvgMin?: number | null;
  defaultEstimateMin?: number | null;
  remainingKm: number;
  routeState?: DriverRouteState | null;
};

function resolveDropoffEta(params: ResolveDropoffParams): {
  eta_min: number;
  fallback_level: EtaFallbackLevel;
  speed_kmh: number;
  used_historical: boolean;
} {
  const {
    driverPos,
    restaurant,
    customer,
    orderStatus,
    driverId,
    liveSpeed,
    historicalAvgMin,
    defaultEstimateMin,
    remainingKm,
    routeState,
  } = params;

  const includePickup = !isPickedUp(orderStatus);
  const boundsKm = remainingKm > 0 ? remainingKm : Math.max(remainingLegDistanceKm(null, restaurant, customer, orderStatus, routeState), 1);

  // Level 1 — current GPS + live speed
  if (driverPos && hasValidPoint(driverPos) && liveSpeed != null && liveSpeed > 3) {
    const raw = computeEtaFromDriverGps(driverPos, restaurant, customer, orderStatus, liveSpeed);
    if (raw > 0) {
      const clamped = clampEtaToRealistic(raw, boundsKm, includePickup);
      return {
        eta_min: clamped,
        fallback_level: 1,
        speed_kmh: Math.min(80, liveSpeed),
        used_historical: false,
      };
    }
  }

  // Level 2 — driver position + average driver speed
  if (driverPos && hasValidPoint(driverPos)) {
    const avgSpeed = driverId
      ? getAdaptiveSpeedKmh(driverId)
      : ROUTING_CONFIG.BASE_SPEED_KMH;
    const raw = computeEtaFromDriverGps(driverPos, restaurant, customer, orderStatus, avgSpeed);
    if (raw > 0) {
      const clamped = clampEtaToRealistic(raw, boundsKm, includePickup);
      return {
        eta_min: clamped,
        fallback_level: 2,
        speed_kmh: avgSpeed,
        used_historical: false,
      };
    }
  }

  // Level 3 — historical delivery time
  if (historicalAvgMin != null && historicalAvgMin > 0) {
    let hist = historicalAvgMin;
    if (isPickedUp(orderStatus) && boundsKm > 0) {
      const { max_min } = physicsEtaBounds(boundsKm, false);
      hist = Math.min(hist, max_min);
    }
    const clamped = clampEtaToRealistic(hist, boundsKm, includePickup);
    return {
      eta_min: clamped,
      fallback_level: 3,
      speed_kmh: ROUTING_CONFIG.BASE_SPEED_KMH,
      used_historical: true,
    };
  }

  // Level 4 — default estimate
  const routeStateEta = routeState?.total_eta_minutes
    ? clampEtaToRealistic(Number(routeState.total_eta_minutes), boundsKm, includePickup)
    : null;

  const eta = routeStateEta ?? level4DefaultEta(boundsKm, includePickup, defaultEstimateMin);
  return {
    eta_min: eta,
    fallback_level: 4,
    speed_kmh: ROUTING_CONFIG.BASE_SPEED_KMH,
    used_historical: false,
  };
}

function confidenceForLevel(level: EtaFallbackLevel, hasDriver: boolean): number {
  if (level === 1) return 0.92;
  if (level === 2) return hasDriver ? 0.8 : 0.65;
  if (level === 3) return 0.58;
  return 0.42;
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
 * Intelligent ETA with explicit fallback chain:
 * 1 live GPS → 2 average speed → 3 historical → 4 default.
 * All values are clamped to physics-realistic bounds for the route distance.
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
    defaultEstimateMin,
  } = input;

  const remainingKm = remainingLegDistanceKm(
    driverPos,
    restaurant,
    customer,
    orderStatus,
    routeState
  );
  const remainingMiles = kmToMiles(remainingKm);
  const includePickup = !isPickedUp(orderStatus);

  const dropoff = resolveDropoffEta({
    driverPos,
    restaurant,
    customer,
    orderStatus,
    driverId,
    liveSpeed,
    historicalAvgMin,
    defaultEstimateMin,
    remainingKm,
    routeState,
  });

  let etaPickup: number | null = null;
  if (driverPos && hasValidPoint(driverPos) && hasValidPoint(restaurant) && includePickup) {
    const speed = dropoff.speed_kmh;
    const distToRest = haversineKm(driverPos, restaurant);
    const rawPickup = travelMinutes(distToRest, speed, driverPos, restaurant);
    etaPickup = clampEtaToRealistic(rawPickup, distToRest || 0.5, false);
  }

  const estimatedArrival = dropoff.eta_min;
  const phase = deriveLiveDeliveryPhase(orderStatus, estimatedArrival);
  const speedMph = kmhToMph(dropoff.speed_kmh);

  return {
    eta_pickup_min: etaPickup,
    eta_dropoff_min: estimatedArrival,
    estimated_arrival_min: estimatedArrival,
    remaining_distance_km: Math.round(remainingKm * 100) / 100,
    remaining_distance_miles: remainingMiles,
    current_speed_kmh: Math.round(dropoff.speed_kmh * 10) / 10,
    current_speed_mph: speedMph,
    live_status: phase,
    eta_message: buildDriverEtaMessage(phase, estimatedArrival, remainingMiles, speedMph),
    customer_eta_message: buildCustomerEtaMessage(phase, estimatedArrival, remainingMiles),
    confidence: confidenceForLevel(dropoff.fallback_level, !!driverPos),
    used_historical_blend: dropoff.used_historical,
    fallback_level: dropoff.fallback_level,
    fallback_source: ETA_FALLBACK_LABELS[dropoff.fallback_level],
  };
}

/** Historical median minutes from delivered orders + ETA snapshots for a restaurant. */
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
    if (min >= 8 && min <= 75) samples.push(min);
  }

  for (const s of snapshots || []) {
    const min = Number(s.eta_dropoff_min);
    if (min >= 3 && min <= 60) samples.push(min);
  }

  if (!samples.length) return null;

  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2
    ? samples[mid]
    : Math.round((samples[mid - 1] + samples[mid]) / 2);
}

export async function fetchDefaultEstimateMinutes(
  db: SupabaseClient,
  restaurantId: string
): Promise<number> {
  const { data: rest } = await db
    .from("restaurants")
    .select("delivery_time_min")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const n = Number(rest?.delivery_time_min);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ETA_MIN;
}

export async function calculateIntelligentEtaForOrder(
  db: SupabaseClient,
  input: Omit<IntelligentEtaInput, "historicalAvgMin" | "defaultEstimateMin"> & {
    restaurantId?: string;
  }
): Promise<IntelligentEtaResult> {
  const restaurantId = input.restaurantId ?? "";
  const [historicalAvgMin, defaultEstimateMin] = await Promise.all([
    restaurantId ? fetchHistoricalDeliveryMinutes(db, restaurantId) : Promise.resolve(null),
    restaurantId ? fetchDefaultEstimateMinutes(db, restaurantId) : Promise.resolve(DEFAULT_ETA_MIN),
  ]);
  return calculateIntelligentEta({
    ...input,
    historicalAvgMin,
    defaultEstimateMin,
  });
}
