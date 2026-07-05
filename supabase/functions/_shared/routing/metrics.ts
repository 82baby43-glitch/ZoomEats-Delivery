import type { RoutingMetrics } from "./types.ts";

const metricsStore = new Map<string, RoutingMetrics>();
const globalMetrics: RoutingMetrics = {
  optimization_count: 0,
  avg_eta_improvement_pct: 0,
  reroute_success_rate: 0,
  reroute_acceptance_rate: 0,
  delivery_time_reduction_min: 0,
};

function getDriverMetrics(driverId: string): RoutingMetrics {
  return metricsStore.get(driverId) ?? {
    optimization_count: 0,
    avg_eta_improvement_pct: 0,
    reroute_success_rate: 0,
    reroute_acceptance_rate: 0,
    delivery_time_reduction_min: 0,
  };
}

export function logOptimization(driverId: string, improvementPct: number, applied: boolean) {
  const m = getDriverMetrics(driverId);
  const n = m.optimization_count + 1;
  m.optimization_count = n;
  m.avg_eta_improvement_pct =
    (m.avg_eta_improvement_pct * (n - 1) + improvementPct) / n;
  if (applied) {
    const successes = m.reroute_success_rate * (n - 1) + 1;
    m.reroute_success_rate = successes / n;
  }
  m.last_event_at = new Date().toISOString();
  metricsStore.set(driverId, m);

  globalMetrics.optimization_count++;
  globalMetrics.avg_eta_improvement_pct =
    (globalMetrics.avg_eta_improvement_pct * (globalMetrics.optimization_count - 1) + improvementPct) /
    globalMetrics.optimization_count;
}

export function logRerouteAccepted(driverId: string, accepted: boolean) {
  const m = getDriverMetrics(driverId);
  const n = m.optimization_count || 1;
  const prev = m.reroute_acceptance_rate * (n - 1);
  m.reroute_acceptance_rate = (prev + (accepted ? 1 : 0)) / n;
  metricsStore.set(driverId, m);
}

export function logDeliveryTimeReduction(driverId: string, minutesSaved: number) {
  const m = getDriverMetrics(driverId);
  m.delivery_time_reduction_min += minutesSaved;
  metricsStore.set(driverId, m);
  globalMetrics.delivery_time_reduction_min += minutesSaved;
}

export function getRoutingMetrics(driverId?: string): RoutingMetrics {
  if (driverId) return { ...getDriverMetrics(driverId) };
  return { ...globalMetrics };
}

export function metricsToLogPayload(driverId: string, event: string, extra: Record<string, unknown> = {}) {
  return {
    driver_id: driverId,
    event_type: event,
    payload: { ...extra, metrics: getDriverMetrics(driverId) },
    created_at: new Date().toISOString(),
  };
}
