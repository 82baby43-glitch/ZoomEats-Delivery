/**
 * ZoomEats Uber-Grade Routing AI — intelligence layer on top of dispatch/stacking.
 * Does NOT replace dispatch-order; augments it with live route optimization.
 */
import type {
  ActiveOrderRef,
  DriverRouteState,
  GpsUpdate,
  RouteOptimizationResult,
  RouteStop,
} from "./types";
import { ROUTING_CONFIG } from "./types";
import { annotateStopEtas, computeRouteEta } from "./eta-engine";
import {
  applyFallbackToState,
  enterFallbackMode,
  isInFallbackMode,
  snapshotGoodRoute,
} from "./fallback";
import { isNearRouteCorridor, metersBetween } from "./geo";
import {
  applyGpsToRouteState,
  getGpsStreamState,
  ingestGpsUpdate,
  shouldTriggerRerouteFromGps,
} from "./gps-stream";
import { logOptimization, metricsToLogPayload } from "./metrics";
import { buildBroadcastPayload, pushRoutingUpdate } from "./realtime-push";
import {
  cacheRouteState,
  getCachedRouteState,
  getIncrementalStops,
  invalidateRouteCache,
} from "./route-cache";
import { dijkstraApproxSequence, insertAndReoptimize, sequenceActiveOrders } from "./sequence-engine";

const lastRerouteAt = new Map<string, number>();
const lastOptimizeAt = new Map<string, number>();
const lastContinuousLoopAt = new Map<string, number>();

function estimateEarningsPerHour(totalEtaMinutes: number, activeOrders: number): number {
  if (totalEtaMinutes <= 0) return 0;
  const ordersPerHour = (activeOrders / totalEtaMinutes) * 60;
  return Math.round(ordersPerHour * 8.5 * 100) / 100;
}

async function persistMetrics(
  db: RoutingDbAdapter,
  driverId: string,
  event: string,
  extra: Record<string, unknown> = {}
) {
  if (!db.logMetric) return;
  try {
    await db.logMetric(metricsToLogPayload(driverId, event, extra));
  } catch {
    /* non-blocking */
  }
}

async function persistFallback(
  db: RoutingDbAdapter,
  driverId: string,
  state: DriverRouteState,
  reason: string
) {
  enterFallbackMode(driverId, state.current_route, reason);
  const fb = applyFallbackToState({ ...state, fallback_mode: true });
  await db.saveDriverState(fb);
}

export interface RoutingDbAdapter {
  getDriverState(driverId: string): Promise<DriverRouteState | null>;
  saveDriverState(state: DriverRouteState): Promise<void>;
  logMetric?(row: Record<string, unknown>): Promise<void>;
  getOrderCoords?(orderId: string): Promise<ActiveOrderRef | null>;
}

export interface RoutingRuntimeConfig {
  supabaseUrl?: string;
  serviceKey?: string;
}

function emptyState(driverId: string, location: { lat: number; lng: number }): DriverRouteState {
  return {
    driver_id: driverId,
    active_orders: [],
    current_location: { ...location, updated_at: new Date().toISOString() },
    current_route: [],
    remaining_stops: [],
    total_eta_minutes: 0,
    total_distance_km: 0,
    last_reroute_timestamp: null,
    fallback_mode: false,
  };
}

function canReroute(driverId: string, improvementPct: number): { ok: boolean; reason?: string } {
  const now = Date.now();
  const lastReroute = lastRerouteAt.get(driverId) ?? 0;
  const lastOpt = lastOptimizeAt.get(driverId) ?? 0;

  if (now - lastOpt < ROUTING_CONFIG.REROUTE_DEBOUNCE_MS) {
    return { ok: false, reason: "debounce" };
  }
  if (now - lastReroute < ROUTING_CONFIG.REROUTE_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }
  if (improvementPct < ROUTING_CONFIG.SMART_REROUTE_MIN_PCT) {
    return { ok: false, reason: "insufficient_improvement" };
  }
  return { ok: true };
}

/** CORE: recalculate optimal route for a driver. */
export function recalculateOptimalRoute(
  driverState: DriverRouteState,
  trigger: "gps" | "new_order" | "traffic" | "stack" | "manual" = "manual"
): RouteOptimizationResult {
  const { driver_id, active_orders, current_location } = driverState;

  if (isInFallbackMode(driver_id)) {
    const fb = applyFallbackToState(driverState);
    return {
      route: fb.current_route,
      total_eta_minutes: fb.total_eta_minutes,
      total_distance_km: fb.total_distance_km,
      improvement_pct: 0,
      method: "cached",
      reroute_applied: false,
      reason: "fallback_mode",
    };
  }

  const start = { lat: current_location.lat, lng: current_location.lng };
  const currentEta = computeRouteEta(driverState.remaining_stops, start, { driverId: driver_id });

  let optimized: RouteStop[];
  if (driverState.remaining_stops.length > 0) {
    optimized = dijkstraApproxSequence(driverState.remaining_stops, start, {
      start,
      driverId: driver_id,
    });
  } else {
    optimized = sequenceActiveOrders(active_orders, start, { start, driverId: driver_id });
  }

  optimized = annotateStopEtas(optimized, start, { driverId: driver_id });
  const newEta = computeRouteEta(optimized, start, { driverId: driver_id });

  const improvementPct =
    currentEta.total_eta_minutes > 0
      ? ((currentEta.total_eta_minutes - newEta.total_eta_minutes) / currentEta.total_eta_minutes) * 100
      : 0;

  const rerouteCheck = canReroute(driver_id, improvementPct);
  const shouldApply =
    rerouteCheck.ok &&
    improvementPct >= ROUTING_CONFIG.MIN_IMPROVEMENT_PCT &&
    getIncrementalStops(driverState.current_route, optimized).changed;

  const detourIncreasePct =
    currentEta.total_distance_km > 0
      ? ((newEta.total_distance_km - currentEta.total_distance_km) / currentEta.total_distance_km) * 100
      : 0;

  if (detourIncreasePct > ROUTING_CONFIG.MAX_DETOUR_INCREASE_PCT) {
    return {
      route: driverState.current_route,
      total_eta_minutes: currentEta.total_eta_minutes,
      total_distance_km: currentEta.total_distance_km,
      improvement_pct: improvementPct,
      method: "dijkstra_approx",
      reroute_applied: false,
      reason: "detour_threshold",
    };
  }

  lastOptimizeAt.set(driver_id, Date.now());

  if (shouldApply) {
    lastRerouteAt.set(driver_id, Date.now());
    logOptimization(driver_id, improvementPct, true);
    return {
      route: optimized,
      total_eta_minutes: newEta.total_eta_minutes,
      total_distance_km: newEta.total_distance_km,
      improvement_pct: improvementPct,
      method: "dijkstra_approx",
      reroute_applied: true,
      reason: trigger,
    };
  }

  logOptimization(driver_id, improvementPct, false);
  return {
    route: driverState.current_route.length ? driverState.current_route : optimized,
    total_eta_minutes: currentEta.total_eta_minutes || newEta.total_eta_minutes,
    total_distance_km: currentEta.total_distance_km || newEta.total_distance_km,
    improvement_pct: improvementPct,
    method: "nearest_neighbor",
    reroute_applied: false,
    reason: rerouteCheck.reason ?? trigger,
  };
}

/** Initialize route when dispatch-order assigns a new order (non-breaking hook). */
export async function initializeRouteForOrder(
  db: RoutingDbAdapter,
  driverId: string,
  order: ActiveOrderRef,
  location: { lat: number; lng: number },
  runtime?: RoutingRuntimeConfig
): Promise<DriverRouteState> {
  let state = (await db.getDriverState(driverId)) ?? emptyState(driverId, location);

  const exists = state.active_orders.some((o) => o.order_id === order.order_id);
  if (!exists) state.active_orders.push(order);

  state.current_location = { ...location, updated_at: new Date().toISOString() };

  const result = recalculateOptimalRoute(state, "new_order");
  state = {
    ...state,
    current_route: result.route,
    remaining_stops: result.route.filter((s) => !s.completed),
    total_eta_minutes: result.total_eta_minutes,
    total_distance_km: result.total_distance_km,
    last_reroute_timestamp: result.reroute_applied ? new Date().toISOString() : state.last_reroute_timestamp,
    earnings_per_hour_estimate: estimateEarningsPerHour(result.total_eta_minutes, state.active_orders.length),
  };

  snapshotGoodRoute(state);
  cacheRouteState(state);
  await db.saveDriverState(state);

  if (result.reroute_applied) {
    await persistMetrics(db, driverId, "route.updated", { improvement_pct: result.improvement_pct, trigger: "new_order" });
  }

  if (runtime?.supabaseUrl && runtime?.serviceKey) {
    await pushRoutingUpdate(
      runtime.supabaseUrl,
      runtime.serviceKey,
      buildBroadcastPayload("order.inserted", driverId, { route_state: state, improvement_pct: result.improvement_pct })
    );
  }

  return state;
}

/** GPS stream ingestion + conditional reroute. */
export async function processGpsAndMaybeReroute(
  db: RoutingDbAdapter,
  update: GpsUpdate,
  runtime?: RoutingRuntimeConfig
): Promise<DriverRouteState | null> {
  ingestGpsUpdate(update);
  let state = (await db.getDriverState(update.driver_id)) ?? getCachedRouteState(update.driver_id);
  if (!state) return null;

  state = applyGpsToRouteState(state, update);

  const shouldReroute = shouldTriggerRerouteFromGps(update.driver_id, state);
  let result: RouteOptimizationResult | null = null;

  if (shouldReroute) {
    result = recalculateOptimalRoute(state, "gps");
    if (result.reroute_applied) {
      state = {
        ...state,
        current_route: result.route,
        remaining_stops: result.route.filter((s) => !s.completed),
        total_eta_minutes: result.total_eta_minutes,
        total_distance_km: result.total_distance_km,
        last_reroute_timestamp: new Date().toISOString(),
        earnings_per_hour_estimate: estimateEarningsPerHour(
          result.total_eta_minutes,
          state.active_orders.length
        ),
      };
      snapshotGoodRoute(state);
      await persistMetrics(db, update.driver_id, "route.updated", {
        improvement_pct: result.improvement_pct,
        trigger: "gps",
      });

      if (runtime?.supabaseUrl && runtime?.serviceKey) {
        await pushRoutingUpdate(
          runtime.supabaseUrl,
          runtime.serviceKey,
          buildBroadcastPayload("route.updated", update.driver_id, {
            route_state: state,
            improvement_pct: result.improvement_pct,
          })
        );
      }
    }
  }

  const lastLoop = lastContinuousLoopAt.get(update.driver_id) ?? 0;
  if (Date.now() - lastLoop >= ROUTING_CONFIG.CONTINUOUS_LOOP_MS) {
    lastContinuousLoopAt.set(update.driver_id, Date.now());
    const loopResult = recalculateOptimalRoute(state, "traffic");
    if (loopResult.reroute_applied) {
      state = {
        ...state,
        current_route: loopResult.route,
        remaining_stops: loopResult.route.filter((s) => !s.completed),
        total_eta_minutes: loopResult.total_eta_minutes,
        total_distance_km: loopResult.total_distance_km,
        last_reroute_timestamp: new Date().toISOString(),
        earnings_per_hour_estimate: estimateEarningsPerHour(
          loopResult.total_eta_minutes,
          state.active_orders.length
        ),
      };
      snapshotGoodRoute(state);
      await persistMetrics(db, update.driver_id, "eta.changed", {
        improvement_pct: loopResult.improvement_pct,
        trigger: "continuous_loop",
      });

      if (runtime?.supabaseUrl && runtime?.serviceKey) {
        await pushRoutingUpdate(
          runtime.supabaseUrl,
          runtime.serviceKey,
          buildBroadcastPayload("eta.changed", update.driver_id, {
            route_state: state,
            improvement_pct: loopResult.improvement_pct,
          })
        );
      }
    }
  }

  cacheRouteState(state);
  await db.saveDriverState(state);
  return state;
}

/** Insert new order into active route corridor during delivery. */
export async function tryInsertOrderIntoRoute(
  db: RoutingDbAdapter,
  driverId: string,
  order: ActiveOrderRef,
  runtime?: RoutingRuntimeConfig
): Promise<{ inserted: boolean; state?: DriverRouteState }> {
  const state = (await db.getDriverState(driverId)) ?? getCachedRouteState(driverId);
  if (!state) return { inserted: false };

  const pickup: RouteStop = {
    stop_id: `pickup_${order.order_id}`,
    order_id: order.order_id,
    type: "pickup",
    lat: order.pickup.lat,
    lng: order.pickup.lng,
    priority: order.priority,
  };
  const dropoff: RouteStop = {
    stop_id: `dropoff_${order.order_id}`,
    order_id: order.order_id,
    type: "dropoff",
    lat: order.dropoff.lat,
    lng: order.dropoff.lng,
  };

  const nearCorridor =
    isNearRouteCorridor(order.pickup, state.current_route, ROUTING_CONFIG.INSERTION_CORRIDOR_KM) ||
    isNearRouteCorridor(order.dropoff, state.current_route, ROUTING_CONFIG.INSERTION_CORRIDOR_KM);

  if (!nearCorridor) return { inserted: false };

  const start = state.current_location;
  const beforeEta = computeRouteEta(state.remaining_stops, start, { driverId }).total_eta_minutes;
  const optimized = insertAndReoptimize(state.remaining_stops, [pickup, dropoff], start, {
    start,
    driverId,
  });
  const afterEta = computeRouteEta(optimized, start, { driverId }).total_eta_minutes;

  if (afterEta >= beforeEta * 0.98) return { inserted: false };

  const newState: DriverRouteState = {
    ...state,
    active_orders: [...state.active_orders, order],
    current_route: annotateStopEtas(optimized, start, { driverId }),
    remaining_stops: optimized,
    total_eta_minutes: afterEta,
    last_reroute_timestamp: new Date().toISOString(),
    earnings_per_hour_estimate: estimateEarningsPerHour(afterEta, state.active_orders.length + 1),
  };

  snapshotGoodRoute(newState);
  cacheRouteState(newState);
  await db.saveDriverState(newState);

  if (runtime?.supabaseUrl && runtime?.serviceKey) {
    await pushRoutingUpdate(
      runtime.supabaseUrl,
      runtime.serviceKey,
      buildBroadcastPayload("stack.modified", driverId, { route_state: newState })
    );
  }

  if (db.logMetric) {
    await db.logMetric(metricsToLogPayload(driverId, "order.inserted", { order_id: order.order_id }));
  }

  return { inserted: true, state: newState };
}

/** Continuous improvement loop — run per active driver every 10–15s. */
export async function runContinuousOptimizationLoop(
  db: RoutingDbAdapter,
  driverIds: string[],
  runtime?: RoutingRuntimeConfig
): Promise<void> {
  for (const driverId of driverIds) {
    try {
      let state = await db.getDriverState(driverId);
      if (!state?.active_orders.length) continue;

      const gps = getGpsStreamState(driverId);
      if (gps) {
        const drift = metersBetween(state.current_location, gps.current);
        if (drift > 30) {
          state = applyGpsToRouteState(state, {
            driver_id: driverId,
            lat: gps.current.lat,
            lng: gps.current.lng,
            timestamp: gps.last_update,
          });
        }
      }

      const result = recalculateOptimalRoute(state, "traffic");
      if (result.reroute_applied) {
        state = {
          ...state,
          current_route: result.route,
          remaining_stops: result.route.filter((s) => !s.completed),
          total_eta_minutes: result.total_eta_minutes,
          total_distance_km: result.total_distance_km,
          last_reroute_timestamp: new Date().toISOString(),
          earnings_per_hour_estimate: estimateEarningsPerHour(
            result.total_eta_minutes,
            state.active_orders.length
          ),
        };
        snapshotGoodRoute(state);
        await persistMetrics(db, driverId, "eta.changed", {
          improvement_pct: result.improvement_pct,
          trigger: "scheduled_loop",
        });

        if (runtime?.supabaseUrl && runtime?.serviceKey) {
          await pushRoutingUpdate(
            runtime.supabaseUrl,
            runtime.serviceKey,
            buildBroadcastPayload("eta.changed", driverId, {
              route_state: state,
              improvement_pct: result.improvement_pct,
            })
          );
        }
      }

      cacheRouteState(state);
      await db.saveDriverState(state);
    } catch (e) {
      console.error(JSON.stringify({ routing_loop_error: String(e), driver_id: driverId }));
      const state = await db.getDriverState(driverId);
      if (state) {
        await persistFallback(db, driverId, state, String(e));
        invalidateRouteCache(driverId);
      }
    }
  }
}

/** Mark pickup/dropoff stops complete and re-optimize remaining route. */
export async function completeRouteStopsForOrder(
  db: RoutingDbAdapter,
  driverId: string,
  orderId: string,
  phase: "pickup" | "dropoff",
  runtime?: RoutingRuntimeConfig
): Promise<DriverRouteState | null> {
  let state = (await db.getDriverState(driverId)) ?? getCachedRouteState(driverId);
  if (!state) return null;

  const completeTypes = phase === "pickup" ? new Set(["pickup"]) : new Set(["pickup", "dropoff"]);

  const markStop = (stop: RouteStop): RouteStop => {
    if (stop.order_id !== orderId) return stop;
    if (!completeTypes.has(stop.type)) return stop;
    return { ...stop, completed: true };
  };

  state = {
    ...state,
    current_route: state.current_route.map(markStop),
    remaining_stops: state.remaining_stops.map(markStop).filter((s) => !s.completed),
    active_orders:
      phase === "dropoff"
        ? state.active_orders.filter((o) => o.order_id !== orderId)
        : state.active_orders.map((o) =>
            o.order_id === orderId ? { ...o, picked_up: true, status: "picked_up" } : o
          ),
  };

  if (state.remaining_stops.length > 0) {
    const result = recalculateOptimalRoute(state, "stack");
    state = {
      ...state,
      current_route: result.route,
      remaining_stops: result.route.filter((s) => !s.completed),
      total_eta_minutes: result.total_eta_minutes,
      total_distance_km: result.total_distance_km,
      earnings_per_hour_estimate: estimateEarningsPerHour(
        result.total_eta_minutes,
        state.active_orders.length
      ),
    };
  } else {
    state = {
      ...state,
      current_route: [],
      total_eta_minutes: 0,
      total_distance_km: 0,
      earnings_per_hour_estimate: 0,
    };
  }

  snapshotGoodRoute(state);
  cacheRouteState(state);
  await db.saveDriverState(state);

  const event = phase === "pickup" ? "stack.modified" : "route.updated";
  await persistMetrics(db, driverId, event, { order_id: orderId, phase });

  if (runtime?.supabaseUrl && runtime?.serviceKey) {
    await pushRoutingUpdate(
      runtime.supabaseUrl,
      runtime.serviceKey,
      buildBroadcastPayload(event, driverId, { route_state: state })
    );
  }

  return state;
}

/** Resolve competing route proposals — lower ETA wins. */
export function resolveRouteConflict(
  proposals: Array<{ driverId: string; eta: number; variance: number; earnings: number }>
): string | null {
  if (!proposals.length) return null;
  proposals.sort((a, b) => {
    const scoreA = a.eta + a.variance * 0.3 - a.earnings * 0.05;
    const scoreB = b.eta + b.variance * 0.3 - b.earnings * 0.05;
    return scoreA - scoreB;
  });
  return proposals[0].driverId;
}

export {
  ROUTING_CONFIG,
  type DriverRouteState,
  type ActiveOrderRef,
  type RouteStop,
  type RouteOptimizationResult,
};
