import type { DriverRouteState, RouteStop } from "./types.ts";

const ROUTE_CACHE_TTL_MS = 30_000;
const GEO_INDEX_CELL_DEG = 0.02; // ~2km cells

type CacheEntry = { state: DriverRouteState; expires: number };
const routeCache = new Map<string, CacheEntry>();
const geoIndex = new Map<string, Set<string>>();

function cellKey(lat: number, lng: number): string {
  const clat = Math.floor(lat / GEO_INDEX_CELL_DEG);
  const clng = Math.floor(lng / GEO_INDEX_CELL_DEG);
  return `${clat}:${clng}`;
}

export function cacheRouteState(state: DriverRouteState) {
  routeCache.set(state.driver_id, {
    state: { ...state },
    expires: Date.now() + ROUTE_CACHE_TTL_MS,
  });
  indexDriver(state.driver_id, state.current_location.lat, state.current_location.lng);
}

export function getCachedRouteState(driverId: string): DriverRouteState | null {
  const entry = routeCache.get(driverId);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    routeCache.delete(driverId);
    return null;
  }
  return entry.state;
}

export function invalidateRouteCache(driverId: string) {
  routeCache.delete(driverId);
}

function indexDriver(driverId: string, lat: number, lng: number) {
  const key = cellKey(lat, lng);
  const set = geoIndex.get(key) ?? new Set();
  set.add(driverId);
  geoIndex.set(key, set);
}

/** Geo-indexed lookup of drivers near a point. */
export function findNearbyDrivers(lat: number, lng: number, radiusCells = 2): string[] {
  const clat = Math.floor(lat / GEO_INDEX_CELL_DEG);
  const clng = Math.floor(lng / GEO_INDEX_CELL_DEG);
  const found = new Set<string>();
  for (let dlat = -radiusCells; dlat <= radiusCells; dlat++) {
    for (let dlng = -radiusCells; dlng <= radiusCells; dlng++) {
      const set = geoIndex.get(`${clat + dlat}:${clng + dlng}`);
      if (set) set.forEach((id) => found.add(id));
    }
  }
  return [...found];
}

export function getIncrementalStops(
  previous: RouteStop[],
  optimized: RouteStop[]
): { changed: boolean; diff: RouteStop[] } {
  if (previous.length !== optimized.length) {
    return { changed: true, diff: optimized };
  }
  for (let i = 0; i < previous.length; i++) {
    if (previous[i].stop_id !== optimized[i].stop_id) {
      return { changed: true, diff: optimized };
    }
  }
  return { changed: false, diff: optimized };
}
