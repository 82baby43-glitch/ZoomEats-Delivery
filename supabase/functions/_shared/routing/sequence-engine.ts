import type { ActiveOrderRef, GeoPoint, RouteStop } from "./types.ts";
import { hasBacktracking } from "./geo.ts";
import { computeRouteEta } from "./eta-engine.ts";

export interface SequenceOptions {
  start: GeoPoint;
  driverId?: string;
  vipFirst?: boolean;
}

function buildStopsFromOrders(orders: ActiveOrderRef[]): RouteStop[] {
  const stops: RouteStop[] = [];
  for (const order of orders) {
    const priority = order.priority ?? 0;
    const locked = priority >= 10;
    stops.push({
      stop_id: `pickup_${order.order_id}`,
      order_id: order.order_id,
      type: "pickup",
      lat: order.pickup.lat,
      lng: order.pickup.lng,
      priority,
      locked,
      completed: order.picked_up ?? false,
      restaurant_id: order.restaurant_id,
      restaurant_name: order.restaurant_name,
    });
    stops.push({
      stop_id: `dropoff_${order.order_id}`,
      order_id: order.order_id,
      type: "dropoff",
      lat: order.dropoff.lat,
      lng: order.dropoff.lng,
      priority,
      locked: false,
      completed: order.status === "delivered",
    });
  }
  return stops.filter((s) => !s.completed);
}

/** Validate pickup always precedes dropoff for each order. */
export function isValidSequence(route: RouteStop[]): boolean {
  const pickupIdx = new Map<string, number>();
  const dropoffIdx = new Map<string, number>();
  route.forEach((s, i) => {
    if (s.type === "pickup") pickupIdx.set(s.order_id, i);
    else dropoffIdx.set(s.order_id, i);
  });
  for (const [orderId, pIdx] of pickupIdx) {
    const dIdx = dropoffIdx.get(orderId);
    if (dIdx === undefined || pIdx >= dIdx) return false;
  }
  return true;
}

/** Nearest-neighbor clustering with pickup-before-dropoff constraint. */
export function nearestNeighborSequence(
  stops: RouteStop[],
  start: GeoPoint,
  _opts: SequenceOptions = { start }
): RouteStop[] {
  const remaining = [...stops];
  const route: RouteStop[] = [];
  const pickedUp = new Set<string>();
  let cursor = start;

  const lockedFirst = remaining
    .filter((s) => s.locked && s.type === "pickup")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const stop of lockedFirst) {
    route.push(stop);
    remaining.splice(remaining.indexOf(stop), 1);
    if (stop.type === "pickup") pickedUp.add(stop.order_id);
    cursor = stop;
  }

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const stop = remaining[i];
      if (stop.type === "dropoff" && !pickedUp.has(stop.order_id)) continue;

      const dist = Math.hypot(stop.lat - cursor.lat, stop.lng - cursor.lng);
      const priorityBoost = (stop.priority ?? 0) * -0.01;
      const score = dist + priorityBoost;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    const next = remaining.splice(bestIdx, 1)[0];
    route.push(next);
    if (next.type === "pickup") pickedUp.add(next.order_id);
    cursor = next;
  }

  return route;
}

/** Time-dependent Dijkstra approximation over valid stop permutations (beam search). */
export function dijkstraApproxSequence(
  stops: RouteStop[],
  start: GeoPoint,
  opts: SequenceOptions = { start }
): RouteStop[] {
  if (stops.length <= 6) {
    return beamSearchOptimal(stops, start, opts);
  }
  const nn = nearestNeighborSequence(stops, start, opts);
  return localTwoOptImprove(nn, start, opts);
}

function beamSearchOptimal(
  stops: RouteStop[],
  start: GeoPoint,
  opts: SequenceOptions
): RouteStop[] {
  type State = { route: RouteStop[]; picked: Set<string>; cursor: GeoPoint };
  let beam: State[] = [{ route: [], picked: new Set(), cursor: start }];

  for (let depth = 0; depth < stops.length; depth++) {
    const nextBeam: Array<State & { eta: number }> = [];
    for (const state of beam) {
      const used = new Set(state.route.map((s) => s.stop_id));
      for (const stop of stops) {
        if (used.has(stop.stop_id)) continue;
        if (stop.type === "dropoff" && !state.picked.has(stop.order_id)) continue;

        const newRoute = [...state.route, stop];
        const newPicked = new Set(state.picked);
        if (stop.type === "pickup") newPicked.add(stop.order_id);
        const { total_eta_minutes } = computeRouteEta(newRoute, start, { driverId: opts.driverId });
        nextBeam.push({
          route: newRoute,
          picked: newPicked,
          cursor: stop,
          eta: total_eta_minutes,
        });
      }
    }
    nextBeam.sort((a, b) => a.eta - b.eta);
    beam = nextBeam.slice(0, 12).map(({ route, picked, cursor }) => ({ route, picked, cursor }));
  }

  const best = beam.sort(
    (a, b) =>
      computeRouteEta(a.route, start, { driverId: opts.driverId }).total_eta_minutes -
      computeRouteEta(b.route, start, { driverId: opts.driverId }).total_eta_minutes
  )[0];

  return best?.route ?? nearestNeighborSequence(stops, start, opts);
}

function localTwoOptImprove(
  route: RouteStop[],
  start: GeoPoint,
  opts: SequenceOptions
): RouteStop[] {
  let best = [...route];
  let bestEta = computeRouteEta(best, start, { driverId: opts.driverId }).total_eta_minutes;
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        if (!isValidSequence(candidate) || hasBacktracking(candidate)) continue;
        const eta = computeRouteEta(candidate, start, { driverId: opts.driverId }).total_eta_minutes;
        if (eta < bestEta - 0.5) {
          best = candidate;
          bestEta = eta;
          improved = true;
        }
      }
    }
  }
  return best;
}

export function sequenceActiveOrders(
  orders: ActiveOrderRef[],
  start: GeoPoint,
  opts: SequenceOptions = { start }
): RouteStop[] {
  const stops = buildStopsFromOrders(orders);
  if (stops.length === 0) return [];
  const dijkstra = dijkstraApproxSequence(stops, start, opts);
  if (!hasBacktracking(dijkstra)) return dijkstra;
  return nearestNeighborSequence(stops, start, opts);
}

export function insertAndReoptimize(
  currentRoute: RouteStop[],
  newStops: RouteStop[],
  start: GeoPoint,
  opts: SequenceOptions = { start }
): RouteStop[] {
  const orderIds = new Set(currentRoute.map((s) => s.order_id));
  const toAdd = newStops.filter((s) => !orderIds.has(s.order_id));
  if (!toAdd.length) return currentRoute;

  const mergedStops = [
    ...currentRoute,
    ...toAdd.filter((s) => !currentRoute.some((r) => r.stop_id === s.stop_id)),
  ];
  return dijkstraApproxSequence(mergedStops, start, opts);
}

export function clusterNearbyDropoffs(route: RouteStop[]): RouteStop[] {
  const pickups = route.filter((s) => s.type === "pickup");
  const dropoffs = route.filter((s) => s.type === "dropoff");
  dropoffs.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  return [...pickups, ...dropoffs].filter((s, i, arr) => isValidSequence(arr.slice(0, i + 1)));
}
