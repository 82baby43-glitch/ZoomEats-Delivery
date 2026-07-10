import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichSpotlights,
  ensureUniqueSlug,
  getSpotlightAnalyticsSummary,
  isSpotlightLive,
  recordSpotlightEvent,
} from "./helpers.ts";
import type { FeaturedMenuItem, SpotlightTag } from "./types.ts";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

const VALID_TAGS = new Set<SpotlightTag>([
  "local_favorites",
  "new_partners",
  "family_owned",
  "late_night",
  "student_favorites",
]);

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter((t) => VALID_TAGS.has(t as SpotlightTag));
}

function parseFeaturedItems(raw: unknown): FeaturedMenuItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      if (!o?.name) return null;
      return {
        item_id: o.item_id ? String(o.item_id) : undefined,
        name: String(o.name),
        description: o.description ? String(o.description) : undefined,
        price: o.price != null ? Number(o.price) : undefined,
        image_url: o.image_url ? String(o.image_url) : undefined,
      };
    })
    .filter(Boolean) as FeaturedMenuItem[];
}

async function getVendorRestaurant(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("restaurants")
    .select("restaurant_id,name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function buildSpotlightPatch(body: Record<string, unknown>, partial = true) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = [
    "title",
    "story",
    "owner_message",
    "cover_image_url",
    "logo_url",
    "video_url",
    "promotion_text",
    "homepage_featured",
    "featured_start_date",
    "featured_end_date",
  ] as const;

  for (const field of fields) {
    if (!partial || body[field] !== undefined) {
      patch[field] = body[field] ?? null;
    }
  }
  if (body.featured_menu_items !== undefined) {
    patch.featured_menu_items = parseFeaturedItems(body.featured_menu_items);
  }
  if (body.spotlight_tags !== undefined) {
    patch.spotlight_tags = parseTags(body.spotlight_tags);
  }
  return patch;
}

async function listPublishedSpotlights(
  db: SupabaseClient,
  opts: {
    homepage?: boolean;
    tag?: string;
    q?: string;
    limit?: number;
  } = {}
) {
  let q = db
    .from("local_partner_spotlights")
    .select("*")
    .eq("status", "published")
    .order("featured_start_date", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 24);

  if (opts.homepage) q = q.eq("homepage_featured", true);
  if (opts.tag && VALID_TAGS.has(opts.tag as SpotlightTag)) {
    q = q.contains("spotlight_tags", [opts.tag]);
  }

  const { data } = await q;
  const live = (data || []).filter(isSpotlightLive);
  const enriched = await enrichSpotlights(db, live);

  if (opts.q) {
    const needle = opts.q.toLowerCase();
    return enriched.filter((s) => {
      const row = s as Record<string, unknown>;
      const r = s.restaurant as Record<string, unknown> | null;
      const hay = [
        row.title,
        row.story,
        row.promotion_text,
        r?.name,
        r?.cuisine,
        r?.description,
        r?.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }
  return enriched;
}

export async function handleSpotlightRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  // ---- Public / customer ----
  if (path === "/spotlight/featured" && method === "GET") {
    const spotlights = await listPublishedSpotlights(db, {
      homepage: params.homepage === "1" || params.homepage === "true",
      tag: params.tag,
      q: params.q,
      limit: Number(params.limit) || 12,
    });
    return { spotlights, message: "Support Local Columbia Businesses" };
  }

  const partnerSlugMatch = path.match(/^\/spotlight\/partners\/([^/]+)$/);
  if (partnerSlugMatch && method === "GET") {
    const slug = decodeURIComponent(partnerSlugMatch[1]);
    const { data: row } = await db
      .from("local_partner_spotlights")
      .select("*")
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();
    if (!row || !isSpotlightLive(row)) throwErr("Spotlight not found", 404);
    const [spotlight] = await enrichSpotlights(db, [row]);
    return spotlight;
  }

  if (path === "/spotlight/analytics" && method === "POST") {
    const eventType = String(body.event_type || "");
    const allowed = [
      "spotlight_view",
      "restaurant_page_click",
      "menu_click",
      "order_generated",
      "promotion_redemption",
      "share_click",
    ];
    if (!allowed.includes(eventType)) throwErr("Invalid event_type");
    let userId: string | null = null;
    try {
      userId = String(ctx.requireAuth().user_id);
    } catch {
      userId = null;
    }
    await recordSpotlightEvent(db, {
      spotlight_id: body.spotlight_id ? String(body.spotlight_id) : null,
      restaurant_id: body.restaurant_id ? String(body.restaurant_id) : null,
      event_type: eventType as never,
      user_id: userId,
      metadata: (body.metadata as Record<string, unknown>) || {},
    });
    return { ok: true };
  }

  if (path === "/spotlight/notifications/preferences" && method === "GET") {
    const u = ctx.requireAuth();
    const { data } = await db
      .from("spotlight_notification_preferences")
      .select("*")
      .eq("user_id", u.user_id)
      .maybeSingle();
    return data ?? { user_id: u.user_id, enabled: false };
  }

  if (path === "/spotlight/notifications/preferences" && method === "PUT") {
    const u = ctx.requireAuth();
    const enabled = Boolean(body.enabled);
    const { data } = await db
      .from("spotlight_notification_preferences")
      .upsert({
        user_id: u.user_id,
        enabled,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    return data;
  }

  // ---- Vendor community profile ----
  if (path === "/vendor/community-profile" && method === "GET") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) return { spotlight: null, restaurant: null };
    const { data: spotlight } = await db
      .from("local_partner_spotlights")
      .select("*")
      .eq("restaurant_id", restaurant.restaurant_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let media: unknown[] = [];
    if (spotlight?.id) {
      const { data: m } = await db
        .from("spotlight_media")
        .select("*")
        .eq("spotlight_id", spotlight.id)
        .order("sort_order", { ascending: true });
      media = m || [];
    }
    return { spotlight, restaurant, media };
  }

  if (path === "/vendor/community-profile" && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) throwErr("Create your restaurant profile first", 400);

    const patch = buildSpotlightPatch(body, false);
    const { data: existing } = await db
      .from("local_partner_spotlights")
      .select("id,status")
      .eq("restaurant_id", restaurant.restaurant_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const submit = Boolean(body.submit_for_review);
    const status = submit ? "pending_review" : "draft";
    const title = String(patch.title || body.title || restaurant.name || "Local Partner");

    if (existing) {
      if (existing.status === "published") {
        throwErr("Published spotlights must be updated by admin", 403);
      }
      const { data } = await db
        .from("local_partner_spotlights")
        .update({
          ...patch,
          title,
          status: submit ? "pending_review" : existing.status === "archived" ? "draft" : existing.status,
          submitted_by: String(u.user_id),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      return data;
    }

    const slug = await ensureUniqueSlug(db, String(restaurant.name));
    const { data } = await db
      .from("local_partner_spotlights")
      .insert({
        restaurant_id: restaurant.restaurant_id,
        title,
        slug,
        ...patch,
        status,
        submitted_by: String(u.user_id),
      })
      .select()
      .single();
    return data;
  }

  if (path === "/vendor/community-profile/media" && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) throwErr("Restaurant not found", 404);

    const { data: spotlight } = await db
      .from("local_partner_spotlights")
      .select("id,status")
      .eq("restaurant_id", restaurant.restaurant_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!spotlight) throwErr("Save your community profile first", 400);
    if (spotlight.status === "published") throwErr("Contact admin to update published media", 403);

    const mediaType = String(body.media_type || "image");
    if (!["image", "video"].includes(mediaType)) throwErr("media_type must be image or video");

    const { data, error } = await db
      .from("spotlight_media")
      .insert({
        spotlight_id: spotlight.id,
        media_type: mediaType,
        media_url: String(body.media_url || ""),
        caption: body.caption ? String(body.caption) : null,
        sort_order: Number(body.sort_order) || 0,
      })
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  if (path === "/vendor/community-profile/media/presign" && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) throwErr("Restaurant not found", 404);

    const fileName = String(body.file_name || "upload.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = String(body.content_type || "image/jpeg");
    const storagePath = `${restaurant.restaurant_id}/${Date.now()}_${fileName}`;
    const { data: signed, error } = await db.storage
      .from("spotlight-media")
      .createSignedUploadUrl(storagePath);
    if (error || !signed) throwErr(error?.message || "Could not create upload URL", 500);
    return {
      upload_url: signed.signedUrl,
      storage_path: storagePath,
      token: signed.token,
      content_type: contentType,
    };
  }

  // ---- Admin ----
  if (path === "/admin/spotlight" && method === "GET") {
    ctx.requireRole("admin");
    const status = params.status;
    let q = db
      .from("local_partner_spotlights")
      .select("*")
      .order("updated_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data } = await q;
    const spotlights = await enrichSpotlights(db, data || []);
    return spotlights;
  }

  if (path === "/admin/spotlight/analytics" && method === "GET") {
    ctx.requireRole("admin");
    const days = Number(params.days) || 30;
    const summary = await getSpotlightAnalyticsSummary(db, days);
    return {
      ...summary,
      headline: `Spotlight generated ${summary.orders_generated} orders in the last ${days} days.`,
    };
  }

  if (path === "/admin/spotlight" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const restaurantId = String(body.restaurant_id || "");
    if (!restaurantId) throwErr("restaurant_id required");

    const { data: restaurant } = await db
      .from("restaurants")
      .select("restaurant_id,name")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!restaurant) throwErr("Restaurant not found", 404);

    const patch = buildSpotlightPatch(body, false);
    const title = String(patch.title || body.title || restaurant.name);
    const slug = await ensureUniqueSlug(
      db,
      String(body.slug || restaurant.name)
    );
    const status = String(body.status || "draft");

    const { data, error } = await db
      .from("local_partner_spotlights")
      .insert({
        restaurant_id: restaurantId,
        title,
        slug,
        ...patch,
        status,
        approved_by: status === "published" ? admin.user_id : null,
        approved_at: status === "published" ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  const adminIdMatch = path.match(/^\/admin\/spotlight\/([^/]+)$/);
  if (adminIdMatch && method === "PUT") {
    ctx.requireRole("admin");
    const id = adminIdMatch[1];
    const patch = buildSpotlightPatch(body);
    if (body.slug) patch.slug = await ensureUniqueSlug(db, String(body.slug), id);
    if (body.status) patch.status = String(body.status);
    const { data, error } = await db
      .from("local_partner_spotlights")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  const publishMatch = path.match(/^\/admin\/spotlight\/([^/]+)\/publish$/);
  if (publishMatch && method === "POST") {
    const admin = ctx.requireRole("admin");
    const id = publishMatch[1];
    const { data: existing } = await db
      .from("local_partner_spotlights")
      .select("id,title,slug,restaurant_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) throwErr("Spotlight not found", 404);

    let slug = existing.slug;
    if (!slug) {
      const { data: rest } = await db
        .from("restaurants")
        .select("name")
        .eq("restaurant_id", existing.restaurant_id)
        .maybeSingle();
      slug = await ensureUniqueSlug(db, String(existing.title || rest?.name || "partner"), id);
    }

    const { data, error } = await db
      .from("local_partner_spotlights")
      .update({
        status: "published",
        slug,
        approved_by: admin.user_id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        featured_start_date: body.featured_start_date ?? new Date().toISOString(),
        featured_end_date: body.featured_end_date ?? null,
        homepage_featured: body.homepage_featured ?? true,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  const archiveMatch = path.match(/^\/admin\/spotlight\/([^/]+)\/archive$/);
  if (archiveMatch && method === "POST") {
    ctx.requireRole("admin");
    const { data, error } = await db
      .from("local_partner_spotlights")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", archiveMatch[1])
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  if (adminIdMatch && method === "DELETE") {
    ctx.requireRole("admin");
    await db.from("spotlight_media").delete().eq("spotlight_id", adminIdMatch[1]);
    await db.from("local_partner_spotlights").delete().eq("id", adminIdMatch[1]);
    return { ok: true };
  }

  return null;
}
