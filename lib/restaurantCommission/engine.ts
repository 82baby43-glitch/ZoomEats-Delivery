import type { SupabaseClient } from "@supabase/supabase-js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type CommissionPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  commission_percent: number;
  active: boolean;
};

export type ResolvedCommission = {
  commission_percent: number;
  source: "merchant_override" | "plan" | "platform_default";
  plan_slug: string | null;
  plan_name: string | null;
};

export type RestaurantPayoutBreakdown = {
  gross_sales: number;
  commission_percent: number;
  commission_amount: number;
  commission_source: string;
  commission_plan_slug: string | null;
  promotion_adjustment: number;
  refund_adjustment: number;
  chargeback_adjustment: number;
  stripe_fee: number;
  net_payout: number;
  status: string;
};

export type SettlementLine = {
  order_id: string;
  created_at: string;
  gross_sales: number;
  commission_amount: number;
  commission_percent: number | null;
  commission_plan_slug: string | null;
  net_payout: number;
  status: string;
};

export type WeeklyPayoutSummary = {
  period_start: string;
  period_end: string;
  order_count: number;
  gross_sales: number;
  commission_total: number;
  net_payout_total: number;
  average_commission_rate: number;
  status: string;
  batch_id: string | null;
};

async function rpcRestaurantPayout(
  db: SupabaseClient,
  grossSales: number,
  commissionPercent: number | null,
  opts: { promotion?: number; refund?: number; chargeback?: number; includeStripe?: boolean } = {}
) {
  const { data, error } = await db.rpc("calculate_restaurant_payout", {
    p_gross_sales: grossSales,
    p_promotion_adjustment: opts.promotion ?? 0,
    p_refund_adjustment: opts.refund ?? 0,
    p_chargeback_adjustment: opts.chargeback ?? 0,
    p_include_stripe_fee: opts.includeStripe ?? false,
    p_commission_percent: commissionPercent,
  });
  if (error || !data) return null;
  return data as Record<string, number | string>;
}

/** Resolve merchant commission: override > plan > platform default rule. */
export async function resolveCommissionRate(
  db: SupabaseClient,
  restaurantId: string
): Promise<ResolvedCommission> {
  const { data: rest } = await db
    .from("restaurants")
    .select("commission_rate,commission_plan_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (rest?.commission_rate != null) {
    return {
      commission_percent: Number(rest.commission_rate),
      source: "merchant_override",
      plan_slug: null,
      plan_name: null,
    };
  }

  if (rest?.commission_plan_id) {
    const { data: plan } = await db
      .from("merchant_commission_plans")
      .select("*")
      .eq("id", rest.commission_plan_id)
      .eq("active", true)
      .maybeSingle();
    if (plan) {
      return {
        commission_percent: Number(plan.commission_percent),
        source: "plan",
        plan_slug: String(plan.slug),
        plan_name: String(plan.name),
      };
    }
  }

  const { data: defaultRule } = await db
    .from("pricing_rules")
    .select("percentage")
    .eq("rule_type", "commission_rate")
    .eq("active", true)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    commission_percent: Number(defaultRule?.percentage ?? 15),
    source: "platform_default",
    plan_slug: null,
    plan_name: null,
  };
}

export async function calculateRestaurantPayout(
  db: SupabaseClient,
  params: {
    restaurantId: string;
    grossSales: number;
    promotionAdjustment?: number;
    refundAdjustment?: number;
    chargebackAdjustment?: number;
    includeStripeFee?: boolean;
  }
): Promise<RestaurantPayoutBreakdown> {
  const commission = await resolveCommissionRate(db, params.restaurantId);
  const calc = await rpcRestaurantPayout(db, params.grossSales, commission.commission_percent, {
    promotion: params.promotionAdjustment,
    refund: params.refundAdjustment,
    chargeback: params.chargebackAdjustment,
    includeStripe: params.includeStripeFee,
  });

  if (!calc) {
    const gross = round2(params.grossSales);
    const commissionAmt = round2(gross * (commission.commission_percent / 100));
    return {
      gross_sales: gross,
      commission_percent: commission.commission_percent,
      commission_amount: commissionAmt,
      commission_source: commission.source,
      commission_plan_slug: commission.plan_slug,
      promotion_adjustment: params.promotionAdjustment ?? 0,
      refund_adjustment: params.refundAdjustment ?? 0,
      chargeback_adjustment: params.chargebackAdjustment ?? 0,
      stripe_fee: 0,
      net_payout: round2(gross - commissionAmt),
      status: "pending",
    };
  }

  return {
    gross_sales: Number(calc.gross_sales ?? params.grossSales),
    commission_percent: Number(calc.commission_percent ?? commission.commission_percent),
    commission_amount: Number(calc.commission_amount ?? 0),
    commission_source: commission.source,
    commission_plan_slug: commission.plan_slug,
    promotion_adjustment: Number(calc.promotion_adjustment ?? 0),
    refund_adjustment: Number(calc.refund_adjustment ?? 0),
    chargeback_adjustment: Number(calc.chargeback_adjustment ?? 0),
    stripe_fee: Number(calc.stripe_fee ?? 0),
    net_payout: Number(calc.net_payout ?? 0),
    status: String(calc.status ?? "pending"),
  };
}

function weekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  };
}

export async function getSettlementReport(
  db: SupabaseClient,
  restaurantId: string,
  limit = 100
): Promise<{ commission: ResolvedCommission; lines: SettlementLine[]; totals: Record<string, number> }> {
  const commission = await resolveCommissionRate(db, restaurantId);
  const { data: rows } = await db
    .from("restaurant_settlements")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const lines: SettlementLine[] = (rows || []).map((r) => ({
    order_id: String(r.order_id),
    created_at: String(r.created_at),
    gross_sales: Number(r.gross_sales ?? 0),
    commission_amount: Number(r.commission_amount ?? 0),
    commission_percent: r.commission_percent != null ? Number(r.commission_percent) : null,
    commission_plan_slug: r.commission_plan_slug ? String(r.commission_plan_slug) : null,
    net_payout: Number(r.net_payout ?? 0),
    status: String(r.status ?? "pending"),
  }));

  const totals = {
    gross_sales: round2(lines.reduce((s, l) => s + l.gross_sales, 0)),
    commission_total: round2(lines.reduce((s, l) => s + l.commission_amount, 0)),
    net_payout_total: round2(lines.reduce((s, l) => s + l.net_payout, 0)),
    order_count: lines.length,
  };

  return { commission, lines, totals };
}

export async function getWeeklyPayoutSummary(
  db: SupabaseClient,
  restaurantId: string,
  periodStart?: string
): Promise<WeeklyPayoutSummary> {
  const bounds = periodStart
    ? { period_start: periodStart, period_end: periodStart }
    : weekBounds();

  if (periodStart) {
    const start = new Date(periodStart + "T00:00:00Z");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    bounds.period_end = end.toISOString().slice(0, 10);
  }

  const { data: batch } = await db
    .from("restaurant_settlement_batches")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("period_start", bounds.period_start)
    .maybeSingle();

  const startIso = `${bounds.period_start}T00:00:00.000Z`;
  const endIso = `${bounds.period_end}T23:59:59.999Z`;

  const { data: settlements } = await db
    .from("restaurant_settlements")
    .select("gross_sales,commission_amount,net_payout,commission_percent")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  const rows = settlements || [];
  const gross = round2(rows.reduce((s, r) => s + Number(r.gross_sales || 0), 0));
  const commission = round2(rows.reduce((s, r) => s + Number(r.commission_amount || 0), 0));
  const net = round2(rows.reduce((s, r) => s + Number(r.net_payout || 0), 0));
  const avgRate =
    rows.length && gross > 0
      ? round2((commission / gross) * 100)
      : batch
        ? round2((Number(batch.commission_total) / Math.max(Number(batch.gross_sales), 1)) * 100)
        : 0;

  return {
    period_start: bounds.period_start,
    period_end: bounds.period_end,
    order_count: rows.length || Number(batch?.order_count ?? 0),
    gross_sales: gross || Number(batch?.gross_sales ?? 0),
    commission_total: commission || Number(batch?.commission_total ?? 0),
    net_payout_total: net || Number(batch?.net_payout_total ?? 0),
    average_commission_rate: avgRate,
    status: String(batch?.status ?? "open"),
    batch_id: batch?.id ? String(batch.id) : null,
  };
}

/** Upsert weekly settlement batch from ledger rows. */
export async function syncWeeklySettlementBatch(
  db: SupabaseClient,
  restaurantId: string,
  periodStart?: string
): Promise<WeeklyPayoutSummary> {
  const summary = await getWeeklyPayoutSummary(db, restaurantId, periodStart);
  const row = {
    restaurant_id: restaurantId,
    period_start: summary.period_start,
    period_end: summary.period_end,
    order_count: summary.order_count,
    gross_sales: summary.gross_sales,
    commission_total: summary.commission_total,
    net_payout_total: summary.net_payout_total,
    status: summary.order_count > 0 ? "ready" : "open",
    updated_at: new Date().toISOString(),
  };

  const { data } = await db
    .from("restaurant_settlement_batches")
    .upsert(row, { onConflict: "restaurant_id,period_start,period_end" })
    .select("id,status")
    .maybeSingle();

  return { ...summary, batch_id: data?.id ? String(data.id) : summary.batch_id, status: String(data?.status ?? summary.status) };
}

export async function listCommissionPlans(db: SupabaseClient): Promise<CommissionPlan[]> {
  const { data } = await db
    .from("merchant_commission_plans")
    .select("*")
    .eq("active", true)
    .order("commission_percent", { ascending: false });
  return (data || []).map((p) => ({
    id: String(p.id),
    slug: String(p.slug),
    name: String(p.name),
    description: p.description ? String(p.description) : null,
    commission_percent: Number(p.commission_percent),
    active: Boolean(p.active),
  }));
}
