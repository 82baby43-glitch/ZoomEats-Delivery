import type { GeoPoint, RouteStop } from "./types";
import { ROUTING_CONFIG } from "./types";
import { haversineKm, totalRouteDistanceKm } from "./geo";
import { buildTrafficSegment, type TrafficContext } from "./traffic-ai";

export interface EtaOptions {
  trafficCtx?: TrafficContext;
  dynamicSpeedKmh?: number;
  pickupWaitMin?: number;
  stackHandlingMin?: number;
  stopPenaltyMin?: number;
}

const driverSpeedProfiles = new Map<string, number[]>();

export function recordDriverSpeed(driverId: string, speedMps: number) {
  const arr = driverSpeedProfiles.get(driverId) ?? [];
  arr.push(speedMps);
  if (arr.length > 20) arr.shift();
  driverSpeedProfiles.set(driverId, arr);
}

export function getAdaptiveSpeedKmh(driverId: string, fallback = ROUTING_CONFIG.BASE_SPEED_KMH): number {
  const samples = driverSpeedProfiles.get(driverId);
  if (!samples?.length) return fallback;
  const avgMps = samples.reduce((a, b) => a + b, 0) / samples.length;
  return Math.max(12, Math.min(55, avgMps * 3.6));
}

export function etaMinutesBetween(
  from: GeoPoint,
  to: GeoPoint,
  opts: EtaOptions & { driverId?: string } = {}
): number {
  const distanceKm = haversineKm(from, to);
  const speedKmh =
    opts.dynamicSpeedKmh ??
    (opts.driverId ? getAdaptiveSpeedKmh(opts.driverId) : ROUTING_CONFIG.BASE_SPEED_KMH);

  const trafficCtx: TrafficContext = {
    ...opts.trafficCtx,
    driverSpeedHistory: opts.driverId
      ? driverSpeedProfiles.get(opts.driverId)
      : opts.trafficCtx?.driverSpeedHistory,
  };

  const segment = buildTrafficSegment(from, to, trafficCtx);
  const travelMin = (distanceKm / speedKmh) * 60 * segment.multiplier;
  return travelMin;
}

export function computeRouteEta(
  stops: RouteStop[],
  start: GeoPoint,
  opts: EtaOptions & { driverId?: string } = {}
): { total_eta_minutes: number; total_distance_km: number; stopEtas: number[] } {
  const stopEtas: number[] = [];
  let cumulative = 0;
  let prev: GeoPoint = start;

  const pickupWait = opts.pickupWaitMin ?? ROUTING_CONFIG.PICKUP_WAIT_MIN;
  const stackHandling = opts.stackHandlingMin ?? ROUTING_CONFIG.STACK_HANDLING_MIN;
  const stopPenalty = opts.stopPenaltyMin ?? ROUTING_CONFIG.STOP_PENALTY_MIN;

  for (const stop of stops) {
    const leg = etaMinutesBetween(prev, stop, opts);
    cumulative += leg;

    if (stop.type === "pickup") cumulative += pickupWait;
    else cumulative += stackHandling;

    cumulative += stopPenalty;
    stopEtas.push(cumulative);
    prev = stop;
  }

  return {
    total_eta_minutes: cumulative,
    total_distance_km: totalRouteDistanceKm(stops, start),
    stopEtas,
  };
}

export function annotateStopEtas(
  stops: RouteStop[],
  start: GeoPoint,
  opts: EtaOptions & { driverId?: string } = {}
): RouteStop[] {
  const { stopEtas } = computeRouteEta(stops, start, opts);
  return stops.map((s, i) => ({ ...s, eta_minutes: Math.round(stopEtas[i] * 10) / 10 }));
}
