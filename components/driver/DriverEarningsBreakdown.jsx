"use client";

import { buildDriverBreakdown } from "@/lib/pricing/orderBreakdown";
import { DriverOrderBreakdown } from "@/components/pricing/OrderPricingBreakdown";

/** @deprecated Use DriverOrderBreakdown — kept for backward compatibility */
export default function DriverEarningsBreakdown({ breakdown, lines, compact = false, source }) {
  if (!breakdown) return null;
  const simplified = buildDriverBreakdown(breakdown);
  return <DriverOrderBreakdown breakdown={simplified} compact={compact} source={source} />;
}
