import type { SupabaseClient } from "@supabase/supabase-js";
import { DISPENSARY_SLUG, categoryApplicationConfig } from "./categoryConfig.ts";

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Ensure a pending merchant row exists so document uploads and category assignment work before full profile setup. */
export async function ensureMerchantStub(
  db: SupabaseClient,
  userId: string,
  opts: { name?: string; merchant_category_slug?: string } = {}
) {
  const slug = opts.merchant_category_slug || "restaurants";
  const { data: claimed } = await db
    .from("restaurants")
    .select("restaurant_id, merchant_category_slug, name, claim_status")
    .eq("owner_id", userId)
    .in("claim_status", ["pending_verification", "verified_local_partner", "claim_requested"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (claimed?.restaurant_id) {
    return claimed.restaurant_id;
  }

  const { data: existing } = await db
    .from("restaurants")
    .select("restaurant_id, merchant_category_slug, name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.restaurant_id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (slug && existing.merchant_category_slug !== slug) updates.merchant_category_slug = slug;
    if (opts.name?.trim() && (!existing.name || existing.name === "Pending merchant")) {
      updates.name = opts.name.trim();
    }
    if (Object.keys(updates).length > 1) {
      await db.from("restaurants").update(updates).eq("restaurant_id", existing.restaurant_id);
    }
    return existing.restaurant_id;
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("restaurants")
    .insert({
      restaurant_id: uid("rest"),
      owner_id: userId,
      name: opts.name?.trim() || "Pending merchant",
      description: "",
      cuisine: "",
      approved: false,
      active: false,
      accepting_orders: false,
      merchant_category_slug: slug,
      business_category: categoryApplicationConfig(slug).businessCategory,
      rating: 4.6,
      delivery_time_min: 30,
      created_at: now,
      updated_at: now,
    })
    .select("restaurant_id")
    .single();

  if (error) throw error;
  return data.restaurant_id as string;
}

export { DISPENSARY_SLUG } from "./categoryConfig.ts";
export { isLiquorCategory, isAgeRestrictedCategory, isRetailCategory } from "./categoryConfig.ts";

export function isDispensaryCategory(slug?: string | null): boolean {
  return slug === DISPENSARY_SLUG;
}

export function businessCategoryForSlug(slug?: string | null): string {
  return categoryApplicationConfig(slug).businessCategory;
}
