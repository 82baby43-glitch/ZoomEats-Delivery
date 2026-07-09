import type { DeliveryModeDefinition, DeliveryModeKey, OrderDeliveryRequirements, VehicleClass } from "./types";

/** Infer minimum vehicle class needed for an order based on requirements. */
export function inferRequiredVehicleClass(req: OrderDeliveryRequirements): VehicleClass | null {
  const weight = req.estimated_weight_lbs ?? 0;
  const bags = req.bag_count ?? 0;
  const drinks = req.large_drink_count ?? 0;
  const dist = req.delivery_distance_km ?? 0;

  if (req.special_handling?.toLowerCase().includes("catering")) return "motor_large";
  if (weight > 80 || bags > 10 || drinks > 12) return "motor_large";
  if (weight > 35 || bags > 5 || drinks > 6 || dist > 20) return "motor";
  if (weight > 12 || bags > 2 || drinks > 2 || dist > 2.5) return "human_powered";
  if (dist <= 2.5 && weight <= 12 && bags <= 2) return "foot";
  return "human_powered";
}

const CLASS_RANK: Record<VehicleClass, number> = {
  foot: 1,
  human_powered: 2,
  motor: 3,
  motor_large: 4,
};

/** Whether a driver's active mode can handle this order. */
export function isModeEligibleForOrder(
  mode: DeliveryModeDefinition,
  req: OrderDeliveryRequirements
): { eligible: boolean; reason?: string } {
  const weight = req.estimated_weight_lbs ?? 0;
  const bags = req.bag_count ?? 0;
  const drinks = req.large_drink_count ?? 0;
  const dist = req.delivery_distance_km ?? 0;

  if (weight > mode.max_weight_lbs) {
    return { eligible: false, reason: `Order weight (${weight} lbs) exceeds ${mode.label} capacity (${mode.max_weight_lbs} lbs)` };
  }
  if (bags > mode.max_bag_count) {
    return { eligible: false, reason: `Bag count (${bags}) exceeds ${mode.label} capacity (${mode.max_bag_count})` };
  }
  if (drinks > mode.max_large_drinks) {
    return { eligible: false, reason: `Large drink count exceeds ${mode.label} capacity` };
  }
  if (dist > mode.max_distance_km) {
    return { eligible: false, reason: `Distance (${dist.toFixed(1)} km) exceeds ${mode.label} range (${mode.max_distance_km} km)` };
  }

  const required = req.required_vehicle_class ?? inferRequiredVehicleClass(req);
  if (required && CLASS_RANK[mode.vehicle_class] < CLASS_RANK[required]) {
    return { eligible: false, reason: `Order requires ${required} class; ${mode.label} is ${mode.vehicle_class}` };
  }

  if (req.special_handling?.toLowerCase().includes("oversized") && mode.vehicle_class === "foot") {
    return { eligible: false, reason: "Oversized order not suitable for walking" };
  }

  return { eligible: true };
}

/** Score boost for dispatch — higher = better fit. */
export function modeFitScore(mode: DeliveryModeDefinition, req: OrderDeliveryRequirements): number {
  const { eligible } = isModeEligibleForOrder(mode, req);
  if (!eligible) return -1;

  const dist = req.delivery_distance_km ?? 5;
  const weight = req.estimated_weight_lbs ?? 5;
  let score = 50;

  // Prefer tighter fit — don't assign car to tiny walking orders
  if (mode.mode_key === "walking" && dist <= 1.5) score += 30;
  if (mode.mode_key === "bicycle" && dist <= 5 && weight <= 20) score += 25;
  if (mode.mode_key === "scooter" && dist <= 15 && dist > 3) score += 20;
  if (mode.mode_key === "car" && (dist > 8 || weight > 30)) score += 25;
  if (mode.mode_key === "suv" && weight > 60) score += 30;

  // Penalize over-capacity modes on small orders
  if (mode.vehicle_class === "motor_large" && weight < 20 && dist < 5) score -= 15;
  if (mode.vehicle_class === "motor" && weight < 8 && dist < 2) score -= 10;

  return score;
}

export function defaultModeForKey(key: DeliveryModeKey): Partial<DeliveryModeDefinition> {
  const defaults: Record<DeliveryModeKey, Partial<DeliveryModeDefinition>> = {
    car: { max_distance_km: 80, max_weight_lbs: 120, max_bag_count: 12, vehicle_class: "motor" },
    bicycle: { max_distance_km: 8, max_weight_lbs: 25, max_bag_count: 4, vehicle_class: "human_powered" },
    scooter: { max_distance_km: 25, max_weight_lbs: 35, max_bag_count: 5, vehicle_class: "motor" },
    walking: { max_distance_km: 2.5, max_weight_lbs: 12, max_bag_count: 2, vehicle_class: "foot" },
    suv: { max_distance_km: 100, max_weight_lbs: 200, max_bag_count: 20, vehicle_class: "motor_large" },
  };
  return defaults[key] ?? defaults.car;
}

/** Estimate order requirements from order row fields. */
export function deriveOrderRequirements(order: Record<string, unknown>): OrderDeliveryRequirements {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((s: number, it: { quantity?: number }) => s + Number(it?.quantity ?? 1), 0);
  const total = Number(order.total ?? 0);

  return {
    estimated_weight_lbs: Number(order.estimated_weight_lbs) || Math.max(2, itemCount * 1.5),
    bag_count: Number(order.bag_count) || Math.max(1, Math.ceil(itemCount / 3)),
    large_drink_count: Number(order.large_drink_count) || 0,
    delivery_distance_km: Number(order.delivery_distance_km) || undefined,
    required_vehicle_class: (order.required_vehicle_class as OrderDeliveryRequirements["required_vehicle_class"]) || undefined,
    special_handling: order.special_handling as string | undefined,
  };
}
