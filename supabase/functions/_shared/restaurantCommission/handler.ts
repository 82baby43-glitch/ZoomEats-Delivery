import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateRestaurantPayout,
  getSettlementReport,
  getWeeklyPayoutSummary,
  listCommissionPlans,
  resolveCommissionRate,
  syncWeeklySettlementBatch,
} from "./engine.ts";

type HandlerCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function queryVal(ctx: HandlerCtx, key: string): string | undefined {
  const fromParams = ctx.params?.[key];
  if (fromParams) return fromParams;
  const fromBody = ctx.body[key];
  return fromBody != null ? String(fromBody) : undefined;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

async function vendorRestaurantId(db: SupabaseClient, userId: string): Promise<string> {
  const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", userId).limit(1).maybeSingle();
  if (!rest?.restaurant_id) throwErr("No restaurant found", 404);
  return String(rest.restaurant_id);
}

export async function handleRestaurantCommissionRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  if (path === "/vendor/settlements" && method === "GET") {
    const u = ctx.requireRole("vendor");
    const restaurantId = await vendorRestaurantId(db, String(u.user_id));
    return getSettlementReport(db, restaurantId);
  }

  if (path === "/vendor/settlements/weekly" && method === "GET") {
    const u = ctx.requireRole("vendor");
    const restaurantId = await vendorRestaurantId(db, String(u.user_id));
    const periodStart = queryVal(ctx, "period_start");
    await syncWeeklySettlementBatch(db, restaurantId, periodStart);
    return getWeeklyPayoutSummary(db, restaurantId, periodStart);
  }

  if (path === "/vendor/settlements/estimate" && method === "POST") {
    const u = ctx.requireRole("vendor");
    const restaurantId = await vendorRestaurantId(db, String(u.user_id));
    const gross = Number(body.gross_sales ?? 0);
    const payout = await calculateRestaurantPayout(db, { restaurantId, grossSales: gross });
    const commission = await resolveCommissionRate(db, restaurantId);
    return { payout, commission };
  }

  if (path === "/admin/commission/plans" && method === "GET") {
    ctx.requireRole("admin");
    return listCommissionPlans(db);
  }

  if (path === "/admin/commission/plans" && method === "POST") {
    ctx.requireRole("admin");
    const row = {
      slug: String(body.slug || "").trim().toLowerCase(),
      name: String(body.name || body.slug),
      description: body.description ? String(body.description) : null,
      commission_percent: Number(body.commission_percent ?? 15),
      active: body.active !== false,
    };
    if (!row.slug) throwErr("slug required");
    const { data, error } = await db.from("merchant_commission_plans").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  const restaurantCommissionMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/commission$/);
  if (restaurantCommissionMatch && method === "PATCH") {
    ctx.requireRole("admin");
    const restaurantId = restaurantCommissionMatch[1];
    const patch: Record<string, unknown> = {};
    if (body.commission_rate != null) patch.commission_rate = Number(body.commission_rate);
    if (body.commission_plan_id != null) patch.commission_plan_id = String(body.commission_plan_id);
    if (body.commission_plan_slug != null) {
      const { data: plan } = await db
        .from("merchant_commission_plans")
        .select("id")
        .eq("slug", String(body.commission_plan_slug))
        .maybeSingle();
      if (!plan) throwErr("Commission plan not found", 404);
      patch.commission_plan_id = plan.id;
      if (body.clear_override) patch.commission_rate = null;
    }
    const { data, error } = await db.from("restaurants").update(patch).eq("restaurant_id", restaurantId).select().single();
    if (error) throw new Error(error.message);
    const commission = await resolveCommissionRate(db, restaurantId);
    return { restaurant: data, commission };
  }

  const adminSettlementsMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/settlements$/);
  if (adminSettlementsMatch && method === "GET") {
    ctx.requireRole("admin");
    const restaurantId = adminSettlementsMatch[1];
    const weekly = await syncWeeklySettlementBatch(db, restaurantId);
    const report = await getSettlementReport(db, restaurantId);
    return { weekly, report };
  }

  return null;
}
