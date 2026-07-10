import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpotlightAnalyticsEvent } from "./types";

export function slugifySpotlightName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function ensureUniqueSlug(db: SupabaseClient, base: string, excludeId?: string) {
  let slug = slugifySpotlightName(base) || "local-partner";
  let attempt = 0;
  while (attempt < 20) {
    let q = db.from("local_partner_spotlights").select("id").eq("slug", slug);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
    attempt += 1;
    slug = `${slugifySpotlightName(base)}-${attempt}`;
  }
  return `${slug}-${Date.now()}`;
}

export function isSpotlightLive(row: {
  status?: string;
  featured_start_date?: string | null;
  featured_end_date?: string | null;
}) {
  if (row.status !== "published") return false;
  const now = Date.now();
  if (row.featured_start_date && new Date(row.featured_start_date).getTime() > now) return false;
  if (row.featured_end_date && new Date(row.featured_end_date).getTime() < now) return false;
  return true;
}

export async function recordSpotlightEvent(
  db: SupabaseClient,
  event: {
    spotlight_id?: string | null;
    restaurant_id?: string | null;
    event_type: SpotlightAnalyticsEvent;
    user_id?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await db.from("spotlight_analytics").insert({
    spotlight_id: event.spotlight_id ?? null,
    restaurant_id: event.restaurant_id ?? null,
    event_type: event.event_type,
    user_id: event.user_id ?? null,
    metadata: event.metadata ?? {},
  });
}

export async function enrichSpotlights(
  db: SupabaseClient,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const restaurantIds = [...new Set(rows.map((r) => String(r.restaurant_id)))];

  const [{ data: restaurants }, { data: media }] = await Promise.all([
    db
      .from("restaurants")
      .select(
        "restaurant_id,name,description,cuisine,image_url,cover_url,address,city,state,rating,delivery_time_min,latitude,longitude"
      )
      .in("restaurant_id", restaurantIds),
    db
      .from("spotlight_media")
      .select("*")
      .in("spotlight_id", ids)
      .order("sort_order", { ascending: true }),
  ]);

  const restMap = new Map((restaurants || []).map((r) => [String(r.restaurant_id), r]));
  const mediaMap = new Map<string, Record<string, unknown>[]>();
  for (const m of media || []) {
    const sid = String(m.spotlight_id);
    if (!mediaMap.has(sid)) mediaMap.set(sid, []);
    mediaMap.get(sid)!.push(m);
  }

  return rows.map((row) => ({
    ...row,
    restaurant: restMap.get(String(row.restaurant_id)) ?? null,
    media: mediaMap.get(String(row.id)) ?? [],
  }));
}

export async function getSpotlightAnalyticsSummary(db: SupabaseClient, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("spotlight_analytics")
    .select("event_type,spotlight_id,restaurant_id")
    .gte("created_at", since);

  const counts: Record<string, number> = {
    spotlight_view: 0,
    restaurant_page_click: 0,
    menu_click: 0,
    order_generated: 0,
    promotion_redemption: 0,
    share_click: 0,
  };

  for (const row of data || []) {
    const key = String(row.event_type);
    if (key in counts) counts[key] += 1;
  }

  const views = counts.spotlight_view || 1;
  const orders = counts.order_generated;
  return {
    period_days: days,
    ...counts,
    conversion_rate: Math.round((orders / views) * 1000) / 10,
    orders_generated: orders,
  };
}
