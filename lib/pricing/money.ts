/** Geo helpers for pricing distance (miles). */

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function clamp(n: number, min?: number | null, max?: number | null): number {
  let v = n;
  if (min != null && Number.isFinite(min)) v = Math.max(v, min);
  if (max != null && Number.isFinite(max)) v = Math.min(v, max);
  return v;
}
