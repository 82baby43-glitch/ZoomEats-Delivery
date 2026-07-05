import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computeRouteEta } from "./eta-engine.ts";
import { isNearRouteCorridor, haversineKm } from "./geo.ts";
import { insertAndReoptimize, sequenceActiveOrders } from "./sequence-engine.ts";
import type { ActiveOrderRef } from "./types.ts";
import { ROUTING_CONFIG } from "./types.ts";
import type { RoutingDbAdapter } from "./uber-routing-ai.ts";
import { resolveRouteConflict } from "./uber-routing-ai.ts";

export type DriverRoutingMode = "init" | "insert";

export interface DriverProposal {
  driverId: string;
  mode: DriverRoutingMode;
  eta: number;
  variance: number;
  earnings: number;
}

function estimateOrderEarnings(order: ActiveOrderRef, totalKm: number): number {
  const base = 4.5;
  const perKm = 1.2;
  return base + totalKm * perKm + (order.priority ?? 0) * 0.5;
}

function etaVariance(stops: number): number {
  return Math.max(0, (stops - 2) * 2.5);
}

/** Score available drivers — prefers route insertion when it improves stack efficiency. */
export async function buildDriverProposals(
  db: SupabaseClient,
  adapter: RoutingDbAdapter,
  order: ActiveOrderRef
): Promise<DriverProposal[]> {
  const { data: drivers } = await db
    .from("drivers")
    .select("*")
    .eq("availability", true)
    .order("workload", { ascending: true })
    .limit(12);

  if (!drivers?.length) return [];

  const proposals: DriverProposal[] = [];

  for (const driver of drivers) {
    const driverId = driver.driver_id as string;
    const start = {
      lat: Number(driver.latitude) || 0,
      lng: Number(driver.longitude) || 0,
    };

    const state = await adapter.getDriverState(driverId);
    const hasActiveRoute = (state?.active_orders?.length ?? 0) > 0;

    if (hasActiveRoute && state) {
      const pickup = {
        stop_id: `pickup_${order.order_id}`,
        order_id: order.order_id,
        type: "pickup" as const,
        lat: order.pickup.lat,
        lng: order.pickup.lng,
        priority: order.priority,
      };
      const dropoff = {
        stop_id: `dropoff_${order.order_id}`,
        order_id: order.order_id,
        type: "dropoff" as const,
        lat: order.dropoff.lat,
        lng: order.dropoff.lng,
      };

      const nearCorridor =
        isNearRouteCorridor(order.pickup, state.current_route, ROUTING_CONFIG.INSERTION_CORRIDOR_KM) ||
        isNearRouteCorridor(order.dropoff, state.current_route, ROUTING_CONFIG.INSERTION_CORRIDOR_KM);

      if (!nearCorridor) continue;

      const beforeEta = computeRouteEta(state.remaining_stops, state.current_location, { driverId }).total_eta_minutes;
      const optimized = insertAndReoptimize(state.remaining_stops, [pickup, dropoff], state.current_location, {
        start: state.current_location,
        driverId,
      });
      const afterEta = computeRouteEta(optimized, state.current_location, { driverId }).total_eta_minutes;

      if (afterEta >= beforeEta * 0.98) continue;

      proposals.push({
        driverId,
        mode: "insert",
        eta: afterEta,
        variance: etaVariance(optimized.length),
        earnings: estimateOrderEarnings(order, state.total_distance_km),
      });
      continue;
    }

    const stops = sequenceActiveOrders([order], start, { start, driverId });
    const eta = computeRouteEta(stops, start, { driverId });
    const distToPickup = haversineKm(start, order.pickup);

    proposals.push({
      driverId,
      mode: "init",
      eta: eta.total_eta_minutes + distToPickup * 0.5,
      variance: etaVariance(stops.length),
      earnings: estimateOrderEarnings(order, eta.total_distance_km),
    });
  }

  return proposals;
}

export async function selectOptimalDriverForOrder(
  db: SupabaseClient,
  adapter: RoutingDbAdapter,
  order: ActiveOrderRef
): Promise<DriverProposal | null> {
  const proposals = await buildDriverProposals(db, adapter, order);
  if (!proposals.length) return null;

  const winnerId = resolveRouteConflict(
    proposals.map((p) => ({
      driverId: p.driverId,
      eta: p.eta,
      variance: p.variance,
      earnings: p.earnings,
    }))
  );

  return proposals.find((p) => p.driverId === winnerId) ?? proposals[0];
}
