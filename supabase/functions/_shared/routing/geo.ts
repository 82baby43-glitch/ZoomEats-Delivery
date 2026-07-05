import type { GeoPoint, RouteStop } from "./types.ts";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Perpendicular distance from point to line segment (km). */
export function pointToSegmentKm(point: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const ab = haversineKm(a, b);
  if (ab < 0.001) return haversineKm(point, a);

  const ap = haversineKm(a, point);
  const bp = haversineKm(b, point);
  const s = (ap + bp + ab) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - ap) * (s - bp) * (s - ab)));
  return (2 * area) / ab;
}

/** True if new stop lies within corridor of existing route polyline. */
export function isNearRouteCorridor(
  point: GeoPoint,
  route: RouteStop[],
  corridorKm: number
): boolean {
  if (route.length < 2) return false;
  for (let i = 0; i < route.length - 1; i++) {
    const dist = pointToSegmentKm(point, route[i], route[i + 1]);
    if (dist <= corridorKm) return true;
  }
  return false;
}

/** Detect backtracking: heading change > 120° between consecutive legs. */
export function hasBacktracking(route: RouteStop[]): boolean {
  if (route.length < 3) return false;
  for (let i = 0; i < route.length - 2; i++) {
    const h1 = bearingDeg(route[i], route[i + 1]);
    const h2 = bearingDeg(route[i + 1], route[i + 2]);
    const delta = Math.abs(((h2 - h1 + 540) % 360) - 180);
    if (delta > 120) return true;
  }
  return false;
}

export function totalRouteDistanceKm(stops: RouteStop[], start?: GeoPoint): number {
  let total = 0;
  let prev: GeoPoint | null = start ?? null;
  for (const stop of stops) {
    if (prev) total += haversineKm(prev, stop);
    prev = stop;
  }
  return total;
}

export function metersBetween(a: GeoPoint, b: GeoPoint): number {
  return haversineKm(a, b) * 1000;
}

export function estimateRoadType(distanceKm: number, urbanHint?: boolean): "urban" | "suburban" | "highway" {
  if (urbanHint || distanceKm < 1.5) return "urban";
  if (distanceKm > 8) return "highway";
  return "suburban";
}
