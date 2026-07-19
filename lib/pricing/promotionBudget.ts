import type { SupabaseClient } from "@supabase/supabase-js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function monthStartIso() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getPromotionBudgetStatus(db: SupabaseClient) {
  const { data: rule } = await db
    .from("pricing_rules")
    .select("value")
    .eq("rule_type", "promotion_budget")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const cap = Number(rule?.value ?? 0);
  if (cap <= 0) {
    return { cap: 0, spent: 0, remaining: 0, unlimited: true };
  }

  const { data: rows } = await db
    .from("pricing_snapshots")
    .select("discount_amount")
    .gte("created_at", monthStartIso());

  const spent = round2((rows || []).reduce((s, r) => s + Number(r.discount_amount || 0), 0));
  return {
    cap,
    spent,
    remaining: round2(Math.max(0, cap - spent)),
    unlimited: false,
  };
}

/** Cap promo discount to remaining monthly promotion budget. */
export async function capDiscountToPromotionBudget(
  db: SupabaseClient,
  discountAmount: number
): Promise<number> {
  const status = await getPromotionBudgetStatus(db);
  if (status.unlimited) return discountAmount;
  return round2(Math.min(discountAmount, status.remaining));
}
