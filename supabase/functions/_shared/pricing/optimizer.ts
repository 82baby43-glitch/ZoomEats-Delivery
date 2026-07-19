import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinancialAnalytics } from "../financial/analytics.ts";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function combinedDeliveryFee(row: Record<string, unknown>) {
  return (
    Number(row.delivery_fee ?? 0) +
    Number(row.distance_fee ?? 0) +
    Number(row.surge_fee ?? 0) +
    Number(row.weather_fee ?? 0) +
    Number(row.small_order_fee ?? 0)
  );
}

export type RecommendationCategory =
  | "delivery_fees"
  | "driver_incentives"
  | "surge_windows"
  | "promotion_timing"
  | "profit_optimization"
  | "restaurant_insights";

export type PricingRecommendation = {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  current_value?: string | number;
  recommended_value?: string | number;
  impact: "high" | "medium" | "low";
  confidence: number;
  rationale: string;
  rule_type?: string;
  actionable: boolean;
};

export type HourlyInsight = {
  hour: number;
  label: string;
  order_count: number;
  avg_profit: number;
  avg_delivery_fee: number;
  surge_candidate: boolean;
};

export type RestaurantInsight = {
  restaurant_id: string;
  name: string;
  order_count: number;
  gross_sales: number;
  commission_total: number;
  avg_commission_rate: number;
  net_payout: number;
  insight: string;
};

export type PricingOptimizerReport = {
  period_days: number;
  generated_at: string;
  data_quality: "rich" | "moderate" | "sparse";
  summary: {
    orders_analyzed: number;
    avg_profit_per_order: number;
    profit_margin_pct: number;
    avg_delivery_fee: number;
    promotion_spend_pct: number;
  };
  hourly_insights: HourlyInsight[];
  restaurant_insights: RestaurantInsight[];
  recommendations: PricingRecommendation[];
  ai_summary?: string;
};

async function getActiveRule(db: SupabaseClient, ruleType: string) {
  const { data } = await db
    .from("pricing_rules")
    .select("*")
    .eq("rule_type", ruleType)
    .eq("active", true)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function hourLabel(h: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}${ampm}`;
}

export async function generatePricingOptimizerReport(
  db: SupabaseClient,
  days = 30
): Promise<PricingOptimizerReport> {
  const periodDays = Math.min(90, Math.max(14, days));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - periodDays);
  const sinceIso = since.toISOString();

  const analytics = await getFinancialAnalytics(db, periodDays);

  const [
    { data: snapshots },
    { data: platformRows },
    { data: driverRows },
    { data: settlements },
    { data: restaurants },
    deliveryRule,
    basePayRule,
    peakBonusRule,
    minProfitRule,
    surgePeakRule,
    promoBudgetRule,
    commissionRule,
  ] = await Promise.all([
    db
      .from("pricing_snapshots")
      .select("*, rule_snapshot, restaurant_id, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    db.from("platform_revenue").select("*").gte("created_at", sinceIso).limit(2000),
    db
      .from("driver_earnings")
      .select("final_driver_pay,peak_bonus,long_distance_bonus,created_at")
      .gte("created_at", sinceIso)
      .limit(2000),
    db
      .from("restaurant_settlements")
      .select("restaurant_id,gross_sales,commission_amount,net_payout,refund_adjustment,created_at")
      .gte("created_at", sinceIso)
      .limit(2000),
    db.from("restaurants").select("restaurant_id,name").limit(500),
    getActiveRule(db, "delivery_fee"),
    getActiveRule(db, "driver_base_pay"),
    getActiveRule(db, "peak_bonus"),
    getActiveRule(db, "min_platform_profit"),
    getActiveRule(db, "surge_multiplier_peak"),
    getActiveRule(db, "promotion_budget"),
    getActiveRule(db, "commission_rate"),
  ]);

  const snaps = snapshots || [];
  const platform = platformRows || [];
  const drivers = driverRows || [];
  const settlementRows = settlements || [];
  const restMap = Object.fromEntries((restaurants || []).map((r) => [r.restaurant_id, r.name]));

  const orderCount = Math.max(snaps.length, platform.length, analytics.summary.order_count);
  const dataQuality: PricingOptimizerReport["data_quality"] =
    orderCount >= 50 ? "rich" : orderCount >= 10 ? "moderate" : "sparse";

  const profitPerOrder = orderCount ? round2(analytics.summary.platform_profit / Math.max(orderCount, 1)) : 0;
  const marginPct =
    analytics.summary.revenue > 0
      ? round2((analytics.summary.platform_profit / analytics.summary.revenue) * 100)
      : 0;
  const promoPct =
    analytics.summary.gmv > 0
      ? round2((analytics.summary.promotion_costs / analytics.summary.gmv) * 100)
      : 0;

  // Hourly bucketing
  const hourBuckets = new Map<number, { orders: number; profit: number; delivery: number }>();
  for (let h = 0; h < 24; h++) hourBuckets.set(h, { orders: 0, profit: 0, delivery: 0 });

  const profitByOrder = new Map<string, number>();
  for (const row of platform) {
    if (row.order_id) profitByOrder.set(String(row.order_id), Number(row.net_profit ?? 0));
  }

  for (const snap of snaps) {
    const h = new Date(String(snap.created_at)).getUTCHours();
    const bucket = hourBuckets.get(h)!;
    bucket.orders += 1;
    bucket.delivery += combinedDeliveryFee(snap);
    bucket.profit += profitByOrder.get(String(snap.order_id)) ?? Number(snap.estimated_profit ?? 0);
  }

  const avgOrdersPerHour = snaps.length ? snaps.length / 24 : 0;
  const hourlyInsights: HourlyInsight[] = [...hourBuckets.entries()].map(([hour, v]) => ({
    hour,
    label: hourLabel(hour),
    order_count: v.orders,
    avg_profit: v.orders ? round2(v.profit / v.orders) : 0,
    avg_delivery_fee: v.orders ? round2(v.delivery / v.orders) : 0,
    surge_candidate: v.orders >= Math.max(3, avgOrdersPerHour * 1.5) && v.orders > 0,
  }));

  // Restaurant aggregation
  const byRestaurant = new Map<string, { gross: number; commission: number; net: number; count: number; refunds: number }>();
  for (const row of settlementRows) {
    const id = String(row.restaurant_id);
    const cur = byRestaurant.get(id) || { gross: 0, commission: 0, net: 0, count: 0, refunds: 0 };
    cur.gross += Number(row.gross_sales ?? 0);
    cur.commission += Number(row.commission_amount ?? 0);
    cur.net += Number(row.net_payout ?? 0);
    cur.count += 1;
    cur.refunds += Number(row.refund_adjustment ?? 0);
    byRestaurant.set(id, cur);
  }

  const restaurantInsights: RestaurantInsight[] = [...byRestaurant.entries()]
    .map(([restaurant_id, v]) => {
      const rate = v.gross > 0 ? round2((v.commission / v.gross) * 100) : 0;
      let insight = "Steady performer";
      if (v.count >= 5 && rate < 12) insight = "High volume — consider preferred commission tier";
      if (v.refunds > v.gross * 0.05) insight = "Elevated refunds — review quality or menu pricing";
      if (v.count <= 2 && v.gross > 100) insight = "Low frequency, high ticket — nurture partnership";
      return {
        restaurant_id,
        name: String(restMap[restaurant_id] || restaurant_id),
        order_count: v.count,
        gross_sales: round2(v.gross),
        commission_total: round2(v.commission),
        avg_commission_rate: rate,
        net_payout: round2(v.net),
        insight,
      };
    })
    .sort((a, b) => b.gross_sales - a.gross_sales)
    .slice(0, 15);

  const recommendations: PricingRecommendation[] = [];
  let recId = 0;
  const add = (rec: Omit<PricingRecommendation, "id">) => {
    recommendations.push({ ...rec, id: `rec_${++recId}` });
  };

  const currentDelivery = Number(deliveryRule?.value ?? 2.99);
  const deliveryMin = Number(deliveryRule?.minimum_amount ?? 1.99);
  const deliveryMax = Number(deliveryRule?.maximum_amount ?? 9.99);
  const avgDelivery = analytics.summary.delivery_fee_average;

  if (marginPct < 12 && avgDelivery < deliveryMax - 0.5) {
    const suggested = round2(Math.min(deliveryMax, avgDelivery + 0.5));
    add({
      category: "delivery_fees",
      title: "Increase delivery fee ceiling",
      description: `Platform margin is ${marginPct}%. Historical avg delivery fee is $${avgDelivery.toFixed(2)}.`,
      current_value: `$${currentDelivery} (max $${deliveryMax})`,
      recommended_value: `$${suggested} target avg`,
      impact: "high",
      confidence: dataQuality === "sparse" ? 0.55 : 0.82,
      rationale: "Low margin with headroom below max delivery fee — a modest fee increase should improve profit per order without blocking checkout.",
      rule_type: "delivery_fee",
      actionable: true,
    });
  } else if (avgDelivery > 0 && marginPct > 25) {
    add({
      category: "delivery_fees",
      title: "Delivery fees are healthy",
      description: `Avg $${avgDelivery.toFixed(2)} delivery with ${marginPct}% margin.`,
      current_value: `$${avgDelivery.toFixed(2)}`,
      recommended_value: "Maintain current range",
      impact: "low",
      confidence: 0.75,
      rationale: "Margins are strong — avoid fee increases that could reduce order volume.",
      actionable: false,
    });
  }

  const currentBasePay = Number(basePayRule?.value ?? 3);
  const avgDriverPay = analytics.summary.avg_driver_payout;
  const driverShare =
    analytics.summary.revenue > 0
      ? round2((analytics.summary.avg_driver_payout * orderCount) / analytics.summary.revenue)
      : 0;

  if (avgDriverPay > 0 && avgDriverPay < currentBasePay + 1 && orderCount >= 10) {
    add({
      category: "driver_incentives",
      title: "Boost base driver pay",
      description: `Average payout $${avgDriverPay.toFixed(2)} may be below competitive for your market.`,
      current_value: `$${currentBasePay}`,
      recommended_value: `$${round2(currentBasePay + 0.5)}`,
      impact: "medium",
      confidence: 0.7,
      rationale: "Driver pay trails base rate after mileage/time — increasing base pay can improve acceptance and retention.",
      rule_type: "driver_base_pay",
      actionable: true,
    });
  }

  const bonusTotal = drivers.reduce(
    (s, d) => s + Number(d.peak_bonus ?? 0) + Number(d.long_distance_bonus ?? 0),
    0
  );
  if (drivers.length && bonusTotal / drivers.length < 0.5 && hourlyInsights.some((h) => h.surge_candidate)) {
    const currentPeak = Number(peakBonusRule?.value ?? 2);
    add({
      category: "driver_incentives",
      title: "Add peak-hour driver bonus",
      description: "High-volume hours detected but few peak bonuses paid.",
      current_value: `$${currentPeak}`,
      recommended_value: `$${round2(currentPeak + 1)}`,
      impact: "medium",
      confidence: 0.68,
      rationale: "Incentivize drivers during surge windows to reduce delivery times and cancellations.",
      rule_type: "peak_bonus",
      actionable: true,
    });
  }

  const surgeHours = hourlyInsights.filter((h) => h.surge_candidate).map((h) => h.label);
  const currentSurgePeak = Number(surgePeakRule?.value ?? 1.15);
  if (surgeHours.length > 0) {
    add({
      category: "surge_windows",
      title: "Expand surge pricing windows",
      description: `Peak demand detected at ${surgeHours.join(", ")}.`,
      current_value: `${currentSurgePeak}x floor`,
      recommended_value: `${round2(Math.min(1.35, currentSurgePeak + 0.1))}x floor`,
      impact: "high",
      confidence: 0.8,
      rationale: "Raise surge floor during historically busy hours to balance supply and protect margin.",
      rule_type: "surge_multiplier_peak",
      actionable: true,
    });
  }

  const lowPromoDays = analytics.trends.promotion_costs.filter((d) => d.amount === 0 && d.count > 0);
  if (lowPromoDays.length >= 5 && analytics.summary.gmv > 0) {
    add({
      category: "promotion_timing",
      title: "Schedule promotions on slow days",
      description: `${lowPromoDays.length} days had orders but zero promo spend.`,
      current_value: `$${Number(promoBudgetRule?.value ?? 500)} monthly budget`,
      recommended_value: "Target Tue–Thu lunch",
      impact: "medium",
      confidence: 0.65,
      rationale: "Run limited-time promos on low-velocity days to lift GMV without eroding peak-hour margin.",
      rule_type: "promotion_budget",
      actionable: false,
    });
  }

  if (promoPct > 8) {
    add({
      category: "promotion_timing",
      title: "Reduce promotion intensity",
      description: `Promo spend is ${promoPct}% of GMV.`,
      current_value: `${promoPct}% of GMV`,
      recommended_value: "Under 5% of GMV",
      impact: "high",
      confidence: 0.85,
      rationale: "Promotion costs are eating margin — tighten codes or shift to off-peak windows.",
      actionable: false,
    });
  }

  const currentMinProfit = Number(minProfitRule?.value ?? 1.5);
  if (profitPerOrder < currentMinProfit && orderCount >= 5) {
    add({
      category: "profit_optimization",
      title: "Raise minimum platform profit floor",
      description: `Avg profit/order $${profitPerOrder.toFixed(2)} is below $${currentMinProfit} target.`,
      current_value: `$${currentMinProfit}`,
      recommended_value: `$${round2(currentMinProfit + 0.25)}`,
      impact: "high",
      confidence: 0.78,
      rationale: "Profit protection will adjust fees on low-margin orders — raising the floor prevents subsidized deliveries.",
      rule_type: "min_platform_profit",
      actionable: true,
    });
  }

  if (marginPct < 15 && orderCount >= 10) {
    add({
      category: "profit_optimization",
      title: "Composite profit lift",
      description: `Overall margin ${marginPct}% on $${analytics.summary.revenue.toFixed(0)} revenue.`,
      current_value: `${marginPct}%`,
      recommended_value: "18–22% target",
      impact: "high",
      confidence: 0.72,
      rationale: "Combine delivery fee tuning, surge windows, and promo caps for a balanced margin recovery.",
      actionable: false,
    });
  }

  const defaultCommission = Number(commissionRule?.percentage ?? 15);
  for (const rest of restaurantInsights.slice(0, 5)) {
    if (rest.order_count >= 3 && rest.avg_commission_rate < defaultCommission - 2) {
      add({
        category: "restaurant_insights",
        title: `${rest.name}: commission opportunity`,
        description: `${rest.order_count} orders, $${rest.gross_sales.toFixed(0)} GMV at ${rest.avg_commission_rate}% commission.`,
        current_value: `${rest.avg_commission_rate}%`,
        recommended_value: `${defaultCommission}% standard plan`,
        impact: rest.gross_sales > 500 ? "high" : "medium",
        confidence: 0.7,
        rationale: rest.insight,
        actionable: false,
      });
    }
  }

  if (recommendations.length === 0) {
    add({
      category: "profit_optimization",
      title: "Collect more order data",
      description: "Not enough historical orders to generate confident recommendations.",
      impact: "low",
      confidence: 0.5,
      rationale: "Complete more deliveries to unlock AI pricing insights. Aim for 20+ orders in the analysis window.",
      actionable: false,
    });
  }

  return {
    period_days: periodDays,
    generated_at: new Date().toISOString(),
    data_quality: dataQuality,
    summary: {
      orders_analyzed: orderCount,
      avg_profit_per_order: profitPerOrder,
      profit_margin_pct: marginPct,
      avg_delivery_fee: analytics.summary.delivery_fee_average,
      promotion_spend_pct: promoPct,
    },
    hourly_insights: hourlyInsights.filter((h) => h.order_count > 0),
    restaurant_insights: restaurantInsights,
    recommendations: recommendations.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact] || b.confidence - a.confidence;
    }),
  };
}

export async function enhanceReportWithAi(
  report: PricingOptimizerReport,
  anthropicKey: string
): Promise<string | null> {
  if (!anthropicKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are a marketplace pricing analyst. Summarize these optimization recommendations in 3-4 concise bullet points for an admin dashboard. Be specific with numbers.\n\n${JSON.stringify({
              summary: report.summary,
              top_recommendations: report.recommendations.slice(0, 6).map((r) => ({
                category: r.category,
                title: r.title,
                rationale: r.rationale,
                recommended: r.recommended_value,
              })),
            })}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}
