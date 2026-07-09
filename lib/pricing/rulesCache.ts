import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingRuleRow } from "./types";

type CacheEntry = { rules: PricingRuleRow[]; expiresAt: number };

const DEFAULT_TTL_MS = 60_000;
let memoryCache: CacheEntry | null = null;

/** In-memory pricing rules cache — target <200ms pricing by avoiding per-request full table scans. */
export async function getCachedPricingRules(
  db: SupabaseClient,
  ttlMs = DEFAULT_TTL_MS
): Promise<PricingRuleRow[]> {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return memoryCache.rules;
  }

  const { data, error } = await db
    .from("pricing_rules")
    .select("id,rule_name,rule_type,value,percentage,minimum_amount,maximum_amount,active,effective_date")
    .eq("active", true)
    .lte("effective_date", new Date().toISOString())
    .order("effective_date", { ascending: false });

  if (error) {
    if (memoryCache) return memoryCache.rules;
    throw new Error(`pricing_rules load failed: ${error.message}`);
  }

  // Keep newest rule per type
  const byType = new Map<string, PricingRuleRow>();
  for (const row of (data || []) as PricingRuleRow[]) {
    if (!byType.has(row.rule_type)) byType.set(row.rule_type, row);
  }
  const rules = Array.from(byType.values());
  memoryCache = { rules, expiresAt: now + ttlMs };
  return rules;
}

export function invalidatePricingRulesCache() {
  memoryCache = null;
}

export function ruleByType(rules: PricingRuleRow[], type: string): PricingRuleRow | null {
  return rules.find((r) => r.rule_type === type) || null;
}
