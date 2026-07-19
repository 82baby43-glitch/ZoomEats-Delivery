import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderPricingBreakdown } from "./orderBreakdown.ts";

type HandlerCtx = {
  path: string;
  method: string;
  requireAuth: () => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

export async function handleOrderPricingBreakdownRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method } = ctx;
  const match = path.match(/^\/orders\/([^/]+)\/pricing-breakdown$/);
  if (!match || method !== "GET") return null;

  const u = ctx.requireAuth();
  const breakdown = await getOrderPricingBreakdown(db, match[1], {
    user_id: String(u.user_id),
    role: u.role ? String(u.role) : undefined,
  });
  if (!breakdown) throwErr("Not found or forbidden", 404);
  return breakdown;
}

export { getOrderPricingBreakdown, buildCustomerBreakdownFromQuote } from "./orderBreakdown.ts";
