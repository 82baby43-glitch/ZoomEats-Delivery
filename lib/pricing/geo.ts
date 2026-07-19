export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.max(0.5, 2 * 3958.8 * Math.asin(Math.sqrt(h)));
}

export function estimateDriveMinutes(distanceMiles: number, trafficMultiplier = 1): number {
  const baseMinutes = Math.max(10, distanceMiles * 4);
  return Math.round(baseMinutes * trafficMultiplier);
}
