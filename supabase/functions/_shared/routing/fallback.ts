import type { DriverRouteState, RouteStop } from "./types.ts";

export interface FallbackState {
  active: boolean;
  reason?: string;
  activated_at?: string;
  last_good_route: RouteStop[];
}

const fallbackByDriver = new Map<string, FallbackState>();

export function enterFallbackMode(
  driverId: string,
  lastGoodRoute: RouteStop[],
  reason: string
): FallbackState {
  const state: FallbackState = {
    active: true,
    reason,
    activated_at: new Date().toISOString(),
    last_good_route: [...lastGoodRoute],
  };
  fallbackByDriver.set(driverId, state);
  return state;
}

export function exitFallbackMode(driverId: string) {
  fallbackByDriver.delete(driverId);
}

export function isInFallbackMode(driverId: string): boolean {
  return fallbackByDriver.get(driverId)?.active ?? false;
}

export function getFallbackRoute(driverId: string): RouteStop[] | null {
  return fallbackByDriver.get(driverId)?.last_good_route ?? null;
}

export function applyFallbackToState(state: DriverRouteState): DriverRouteState {
  if (!isInFallbackMode(state.driver_id)) return state;
  const fallbackRoute = getFallbackRoute(state.driver_id);
  if (!fallbackRoute?.length) return { ...state, fallback_mode: true };
  return {
    ...state,
    fallback_mode: true,
    current_route: fallbackRoute,
    remaining_stops: fallbackRoute.filter((s) => !s.completed),
    last_good_route: fallbackRoute,
  };
}

export function snapshotGoodRoute(state: DriverRouteState) {
  if (state.current_route.length > 0) {
    const fb = fallbackByDriver.get(state.driver_id);
    if (!fb?.active) {
      fallbackByDriver.set(state.driver_id, {
        active: false,
        last_good_route: [...state.current_route],
      });
    } else if (fb) {
      fb.last_good_route = [...state.current_route];
    }
  }
}
