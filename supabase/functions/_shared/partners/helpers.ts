import type { SupabaseClient } from "@supabase/supabase-js";
import { isTestRestaurantName } from "../restaurants.ts";
import type { PartnerAnalytics, PartnerStatus, RestaurantListing } from "./types.ts";

export function normalizePartnerStatus(value?: string | null): PartnerStatus {
  if (value === "claim_pending" || value === "verified_partner" || value === "featured_partner") {
    return value;
  }
  return "unclaimed";
}

export function isRestaurantClaimable(row: {
  partner_status?: string | null;
  owner_id?: string | null;
  claim_status?: string | null;
}): boolean {
  const status = normalizePartnerStatus(row.partner_status);
  if (status !== "unclaimed") return false;
  if (row.owner_id) return false;
  if (row.claim_status === "pending" || row.claim_status === "approved") return false;
  return true;
}

export function dedupeRestaurants<T extends { restaurant_id: string; name?: string | null }>(
  rows: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row.restaurant_id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export function sortRestaurantsAlphabetically<T extends { name?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
}

export function filterRestaurantListings(
  rows: RestaurantListing[],
  opts: { q?: string; category?: string; claimableOnly?: boolean }
): RestaurantListing[] {
  let list = dedupeRestaurants(rows.filter((r) => !isTestRestaurantName(r.name)));
  if (opts.claimableOnly) {
    list = list.filter(isRestaurantClaimable);
  }
  if (opts.category) {
    const needle = opts.category.toLowerCase();
    list = list.filter((r) =>
      [r.cuisine, r.primary_category].some((v) => String(v || "").toLowerCase().includes(needle))
    );
  }
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    list = list.filter((r) =>
      [r.name, r.address, r.city, r.state, r.cuisine, r.primary_category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }
  return sortRestaurantsAlphabetically(list);
}

export function extractCategories(rows: RestaurantListing[]): string[] {
  const cats = new Set<string>();
  for (const row of rows) {
    if (row.cuisine?.trim()) cats.add(row.cuisine.trim());
    if (row.primary_category?.trim()) cats.add(row.primary_category.trim());
  }
  return [...cats].sort((a, b) => a.localeCompare(b));
}

export async function getPartnerAnalytics(db: SupabaseClient): Promise<PartnerAnalytics> {
  const [{ count: totalListed }, { count: verified }, { count: featured }, { count: pendingClaims }, { count: unclaimed }] =
    await Promise.all([
      db.from("restaurants").select("*", { count: "exact", head: true }).not("name", "ilike", "TEST_%"),
      db.from("restaurants").select("*", { count: "exact", head: true }).eq("partner_status", "verified_partner"),
      db.from("restaurants").select("*", { count: "exact", head: true }).eq("partner_status", "featured_partner"),
      db.from("restaurant_claims").select("*", { count: "exact", head: true }).eq("verification_status", "pending"),
      db.from("restaurants").select("*", { count: "exact", head: true }).eq("partner_status", "unclaimed"),
    ]);

  const { count: claimed } = await db
    .from("restaurants")
    .select("*", { count: "exact", head: true })
    .not("claimed_by_user_id", "is", null);

  const total = totalListed || 0;
  const claimedCount = claimed || 0;
  return {
    total_listed: total,
    total_claimed: claimedCount,
    verified_partners: (verified || 0) + (featured || 0),
    featured_partners: featured || 0,
    pending_claims: pendingClaims || 0,
    unclaimed_opportunities: unclaimed || 0,
    claim_conversion_rate: total > 0 ? Math.round((claimedCount / total) * 1000) / 10 : 0,
  };
}

export async function enrichClaimsWithRestaurants(
  db: SupabaseClient,
  claims: Record<string, unknown>[]
) {
  if (!claims.length) return [];
  const restaurantIds = [...new Set(claims.map((c) => String(c.restaurant_id)))];
  const userIds = [...new Set(claims.map((c) => String(c.user_id)))];
  const [{ data: restaurants }, { data: users }] = await Promise.all([
    db
      .from("restaurants")
      .select(
        "restaurant_id,name,address,city,state,cuisine,primary_category,partner_status,merchant_verified,owner_id"
      )
      .in("restaurant_id", restaurantIds),
    db.from("users").select("user_id,name,email").in("user_id", userIds),
  ]);
  const restMap = new Map((restaurants || []).map((r) => [String(r.restaurant_id), r]));
  const userMap = new Map((users || []).map((u) => [String(u.user_id), u]));
  return claims.map((claim) => ({
    ...claim,
    restaurant: restMap.get(String(claim.restaurant_id)) ?? null,
    user: userMap.get(String(claim.user_id)) ?? null,
  }));
}
