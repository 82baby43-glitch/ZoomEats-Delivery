import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePricingQuote } from "./pricing/engine.ts";

type AdminCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

const EDITABLE_RULE_TYPES = [
  "driver_base_pay",
  "mileage_rate",
  "time_rate",
  "wait_rate",
  "service_fee",
  "commission_rate",
  "delivery_fee",
  "small_order_fee",
  "small_order_threshold",
  "distance_fee",
  "surge_limit",
  "weather_fee",
  "tax_rate",
  "stripe_fee_percent",
  "stripe_fee_fixed",
  "peak_bonus",
  "large_order_bonus",
  "large_order_threshold",
  "guaranteed_pay",
  "min_platform_profit",
  "subsidy_enabled",
  "promotion_budget",
  "pricing_version",
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function handlePricingAdminRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  if (!path.startsWith("/admin/pricing")) return null;
  ctx.requireRole("admin");

  if (path === "/admin/pricing/rules" && method === "GET") {
    const { data, error } = await db
      .from("pricing_rules")
      .select("*")
      .order("rule_type")
      .order("effective_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  if (path === "/admin/pricing/rules" && method === "POST") {
    const ruleType = String(body.rule_type || "");
    if (!EDITABLE_RULE_TYPES.includes(ruleType)) {
      throw new Error(`Invalid rule_type: ${ruleType}`);
    }
    const row = {
      rule_name: String(body.rule_name || ruleType),
      rule_type: ruleType,
      value: body.value != null ? Number(body.value) : 0,
      percentage: body.percentage != null ? Number(body.percentage) : null,
      minimum_amount: body.minimum_amount != null ? Number(body.minimum_amount) : null,
      maximum_amount: body.maximum_amount != null ? Number(body.maximum_amount) : null,
      active: body.active !== false,
      effective_date: new Date().toISOString(),
    };

    await db
      .from("pricing_rules")
      .update({ active: false })
      .eq("rule_type", ruleType)
      .eq("active", true);

    const { data, error } = await db.from("pricing_rules").insert(row).select().single();
    if (error) throw new Error(error.message);

    await db.from("pricing_audit_logs").insert({
      action: "rule_updated",
      new_value: row,
      changed_by: "admin",
    });

    return data;
  }

  const rulePatchMatch = path.match(/^\/admin\/pricing\/rules\/([^/]+)$/);
  if (rulePatchMatch && method === "PATCH") {
    const id = rulePatchMatch[1];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.value != null) patch.value = Number(body.value);
    if (body.percentage != null) patch.percentage = Number(body.percentage);
    if (body.minimum_amount != null) patch.minimum_amount = Number(body.minimum_amount);
    if (body.maximum_amount != null) patch.maximum_amount = Number(body.maximum_amount);
    if (body.active != null) patch.active = Boolean(body.active);
    if (body.rule_name != null) patch.rule_name = String(body.rule_name);

    const { data, error } = await db.from("pricing_rules").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  if (path === "/admin/pricing/simulate" && method === "POST") {
    const subtotal = Number(body.subtotal ?? 25);
    const restaurantId = String(body.restaurant_id || "");
    const quote = await calculatePricingQuote(db, {
      subtotal,
      restaurantId: restaurantId || "sim",
      customerLat: body.customer_lat != null ? Number(body.customer_lat) : 37.7749,
      customerLng: body.customer_lng != null ? Number(body.customer_lng) : -122.4194,
      restaurantLat: body.restaurant_lat != null ? Number(body.restaurant_lat) : 37.7849,
      restaurantLng: body.restaurant_lng != null ? Number(body.restaurant_lng) : -122.4094,
      tipAmount: body.tip_amount != null ? Number(body.tip_amount) : 0,
      promoCode: body.promo_code ? String(body.promo_code) : null,
      allowSubsidy: Boolean(body.allow_subsidy),
      skipProfitProtection: Boolean(body.skip_profit_protection),
    });
    return quote;
  }

  if (path === "/admin/pricing/snapshots" && method === "GET") {
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50)));
    const { data, error } = await db
      .from("pricing_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  }

  if (path === "/admin/pricing/summary" && method === "GET") {
    const [{ data: snapshots }, { data: rules }] = await Promise.all([
      db.from("pricing_snapshots").select("customer_total,estimated_profit,driver_payout,restaurant_payout,pricing_version").order("created_at", { ascending: false }).limit(500),
      db.from("pricing_rules").select("*").eq("active", true).order("rule_type"),
    ]);

    const rows = snapshots || [];
    const totalOrders = rows.length;
    const avgProfit = totalOrders ? round2(rows.reduce((s, r) => s + Number(r.estimated_profit || 0), 0) / totalOrders) : 0;
    const avgTotal = totalOrders ? round2(rows.reduce((s, r) => s + Number(r.customer_total || 0), 0) / totalOrders) : 0;

    return {
      snapshot_count: totalOrders,
      average_order_total: avgTotal,
      average_profit: avgProfit,
      active_rules: (rules || []).length,
      rules: rules || [],
    };
  }

  return null;
}
