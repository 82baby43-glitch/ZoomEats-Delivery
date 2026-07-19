import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseDriverApis } from "../founderDriver/auth";
import {
  calculateDriverEarnings,
  estimateDriverEarningsForOrder,
  formatDriverEarningsLines,
  getDriverEarningsSummary,
  getDriverOrderEarningsBreakdown,
} from "./engine";

type HandlerCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  requireAuth: () => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function requireDriver(ctx: HandlerCtx) {
  const u = ctx.requireAuth();
  if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
    throwErr("Delivery or founder driver access required", 403);
  }
  return u;
}

export async function handleDriverEarningsRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  if (path === "/driver/earnings" && method === "GET") {
    const u = requireDriver(ctx);
    const summary = await getDriverEarningsSummary(db, String(u.user_id));
    return summary;
  }

  if (path === "/driver/earnings/estimate" && method === "POST") {
    requireDriver(ctx);
    const orderId = String(body.order_id || "");
    if (!orderId) throwErr("order_id required");

    const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    if (!order) throwErr("Order not found", 404);

    const { data: rest } = order.restaurant_id
      ? await db.from("restaurants").select("latitude,longitude").eq("restaurant_id", order.restaurant_id).maybeSingle()
      : { data: null };

    const breakdown = await estimateDriverEarningsForOrder(db, order, rest);
    return {
      breakdown,
      lines: formatDriverEarningsLines(breakdown),
      estimated_total: breakdown.final_driver_pay,
    };
  }

  const orderMatch = path.match(/^\/driver\/earnings\/orders\/([^/]+)$/);
  if (orderMatch && method === "GET") {
    const u = requireDriver(ctx);
    const result = await getDriverOrderEarningsBreakdown(db, String(u.user_id), orderMatch[1]);
    if (!result) throwErr("Earnings not found", 404);
    return {
      order_id: orderMatch[1],
      source: result.source,
      breakdown: result.breakdown,
      lines: formatDriverEarningsLines(result.breakdown),
    };
  }

  if (path === "/driver/earnings/calculate" && method === "POST") {
    requireDriver(ctx);
    const breakdown = await calculateDriverEarnings(db, {
      distanceMiles: Number(body.distance_miles ?? 0),
      durationMinutes: body.duration_minutes != null ? Number(body.duration_minutes) : undefined,
      waitMinutes: body.wait_minutes != null ? Number(body.wait_minutes) : undefined,
      tipAmount: body.tip_amount != null ? Number(body.tip_amount) : 0,
      orderSubtotal: body.order_subtotal != null ? Number(body.order_subtotal) : 0,
      weatherActive: Boolean(body.weather_active),
      peakActive: body.peak_active != null ? Boolean(body.peak_active) : undefined,
      bonusPay: body.bonus_pay != null ? Number(body.bonus_pay) : 0,
    });
    return { breakdown, lines: formatDriverEarningsLines(breakdown) };
  }

  return null;
}

export {
  calculateDriverEarnings,
  estimateDriverEarningsForOrder,
  getDriverEarningsSummary,
  getDriverOrderEarningsBreakdown,
  formatDriverEarningsLines,
};
