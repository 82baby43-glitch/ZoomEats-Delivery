import type { GeoPoint, RoadType, TrafficSegment } from "./types";
import { estimateRoadType, haversineKm } from "./geo";

/** Historical congestion by hour (0–23) — urban baseline. */
const HOURLY_CONGESTION: Record<number, number> = {
  0: 0.9, 1: 0.85, 2: 0.8, 3: 0.8, 4: 0.85, 5: 0.95,
  6: 1.1, 7: 1.35, 8: 1.55, 9: 1.4, 10: 1.2, 11: 1.25,
  12: 1.45, 13: 1.35, 14: 1.2, 15: 1.15, 16: 1.25, 17: 1.5,
  18: 1.6, 19: 1.45, 20: 1.2, 21: 1.05, 22: 1.0, 23: 0.95,
};

const ROAD_TYPE_BASE: Record<RoadType, number> = {
  urban: 1.25,
  suburban: 1.0,
  highway: 0.85,
};

export interface TrafficContext {
  hour?: number;
  driverSpeedHistory?: number[];
  isUrban?: boolean;
}

export function getTimeOfDayMultiplier(date = new Date()): number {
  return HOURLY_CONGESTION[date.getHours()] ?? 1.0;
}

export function getDriverSpeedFactor(speedHistory: number[]): number {
  if (!speedHistory.length) return 1.0;
  const avg = speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;
  const baselineMps = 8.9; // ~32 km/h
  if (avg < baselineMps * 0.5) return 1.35;
  if (avg < baselineMps * 0.75) return 1.15;
  if (avg > baselineMps * 1.3) return 0.9;
  return 1.0;
}

export function computeTrafficMultiplier(
  from: GeoPoint,
  to: GeoPoint,
  ctx: TrafficContext = {}
): number {
  const distanceKm = haversineKm(from, to);
  const roadType = estimateRoadType(distanceKm, ctx.isUrban);
  const timeMul = getTimeOfDayMultiplier();
  const roadMul = ROAD_TYPE_BASE[roadType];
  const speedMul = ctx.driverSpeedHistory?.length
    ? getDriverSpeedFactor(ctx.driverSpeedHistory)
    : 1.0;

  const raw = timeMul * roadMul * speedMul;
  return Math.min(2.2, Math.max(1.0, raw));
}

export function buildTrafficSegment(
  from: GeoPoint,
  to: GeoPoint,
  ctx: TrafficContext = {}
): TrafficSegment {
  const distanceKm = haversineKm(from, to);
  const road_type = estimateRoadType(distanceKm, ctx.isUrban);
  const multiplier = computeTrafficMultiplier(from, to, ctx);
  const baseMinutes = (distanceKm / 32) * 60;
  const delay_minutes = baseMinutes * (multiplier - 1);
  return { from, to, road_type, multiplier, delay_minutes };
}
