import type { SupabaseClient } from "@supabase/supabase-js";
import { createRoutingDbAdapter } from "../routing/db-adapter.ts";
import { buildDriverProposals } from "../routing/dispatch-routing.ts";
import { haversineKm } from "../routing/geo.ts";
import { etaMinutesBetween } from "../routing/eta-engine.ts";
import { getTimeOfDayMultiplier } from "../routing/traffic-ai.ts";
import type { DispatchExplainPanel } from "./types.ts";

function routingComposite(eta: number, variance: number, earnings: number): number {
  return eta + variance * 0.3 - earnings * 0.05;
}

function fallbackExplain(order: Record<string, unknown>): DispatchExplainPanel {
  return {
    order_id: String(order.order_id),
    dispatch_score: 0,
    restaurant_distance_pct: 0,
    driver_distance_pct: 0,
    predicted_wait_pct: 0,
    traffic_pct: 0,
    workload_pct: 0,
    profitability: Number(order.total || 0) * 0.15,
    confidence: 0,
    reason: "Insufficient routing data for dispatch scoring",
  };
}

function toPercent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export async function buildDispatchExplain(
  db: SupabaseClient,
  order: Record<string, unknown>,
  assignedDriverId?: string | null
): Promise<DispatchExplainPanel> {
  const orderId = String(order.order_id);
  const adapter = createRoutingDbAdapter(db);
  const orderRef = await adapter.getOrderCoords(orderId);
  if (!orderRef?.pickup?.lat || !orderRef?.dropoff?.lat) return fallbackExplain(order);

  const proposals = await buildDriverProposals(db, adapter, orderRef);
  const driverId = String(assignedDriverId || order.driver_id || "");
  const proposal = proposals.find((p) => p.driverId === driverId) ?? proposals[0];

  const { data: driver } = driverId
    ? await db.from("drivers").select("driver_id,latitude,longitude,workload").eq("driver_id", driverId).maybeSingle()
    : { data: null };

  const driverPos = {
    lat: Number(driver?.latitude) || orderRef.pickup.lat,
    lng: Number(driver?.longitude) || orderRef.pickup.lng,
  };

  const restDist = haversineKm(driverPos, orderRef.pickup);
  const deliveryDist = haversineKm(orderRef.pickup, orderRef.dropoff);
  const totalDist = restDist + deliveryDist || 1;

  const restEta = etaMinutesBetween(driverPos, orderRef.pickup, { driverId: driverId || undefined });
  const deliveryEta = etaMinutesBetween(orderRef.pickup, orderRef.dropoff, { driverId: driverId || undefined });
  const totalEta = restEta + deliveryEta || 1;

  const trafficMul = getTimeOfDayMultiplier();
  const trafficPct = Math.round((trafficMul - 1) * 100);
  const workloadPct = Math.min(100, Number(driver?.workload || 0) * 12);

  const composites = proposals.map((p) => routingComposite(p.eta, p.variance, p.earnings));
  const best = composites.length ? Math.min(...composites) : 0;
  const worst = composites.length ? Math.max(...composites) : best + 1;
  const assignedComposite = proposal
    ? routingComposite(proposal.eta, proposal.variance, proposal.earnings)
    : best;

  const dispatchScore = composites.length <= 1
    ? 92
    : Math.max(55, Math.min(99, Math.round(99 - ((assignedComposite - best) / Math.max(0.01, worst - best)) * 44)));

  const confidence = proposals.length
    ? Math.min(0.98, 0.62 + proposals.length * 0.03 + (proposal ? 0.1 : 0))
    : 0.4;

  const reason = proposal
    ? `Assigned via ${proposal.mode} routing — ETA ${Math.round(proposal.eta)}m, earnings ~$${proposal.earnings.toFixed(2)}, ${proposals.length} candidate(s) scored`
    : "No optimal routing proposal — awaiting dispatch";

  return {
    order_id: orderId,
    dispatch_score: dispatchScore,
    restaurant_distance_pct: toPercent(restDist, totalDist),
    driver_distance_pct: toPercent(restEta, totalEta),
    predicted_wait_pct: toPercent(proposal?.variance ?? 0, proposal?.eta ?? 1),
    traffic_pct: Math.max(0, trafficPct),
    workload_pct: workloadPct,
    profitability: proposal?.earnings ?? Number(order.total || 0) * 0.15,
    confidence,
    reason,
  };
}
