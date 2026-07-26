import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { finalizePublicRestaurantList } from "../restaurantListing.ts";
import { filterPublicRestaurants } from "../restaurants.ts";

const HERO_ID = "default";
const HERO_BUCKET = "hero-images";

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function publicStorageUrl(storagePath: string): string {
  const base = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${HERO_BUCKET}/${storagePath}`;
}

function hiddenIds(row: Record<string, unknown> | null | undefined): string[] {
  const raw = row?.hidden_restaurant_ids;
  return Array.isArray(raw) ? raw.map(String) : [];
}

async function ensureHeroRow(db: SupabaseClient) {
  const { data } = await db.from("homepage_hero").select("id").eq("id", HERO_ID).maybeSingle();
  if (data?.id) return;
  await db.from("homepage_hero").insert({ id: HERO_ID, enabled: false });
}

async function getHeroRow(db: SupabaseClient) {
  await ensureHeroRow(db);
  const { data, error } = await db.from("homepage_hero").select("*").eq("id", HERO_ID).maybeSingle();
  if (error) throwErr(error.message, 500);
  return data;
}

async function clearHeroRow(db: SupabaseClient, updatedBy: string) {
  await ensureHeroRow(db);
  const cleared = {
    enabled: false,
    restaurant_id: null,
    image_url: null,
    image_storage_path: null,
    use_restaurant_image: true,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("homepage_hero")
    .update(cleared)
    .eq("id", HERO_ID)
    .select()
    .maybeSingle();

  if (error) throwErr(error.message, 500);
  if (data) return data;

  const { data: inserted, error: insertError } = await db
    .from("homepage_hero")
    .insert({ id: HERO_ID, ...cleared })
    .select()
    .single();
  if (insertError) throwErr(insertError.message, 500);
  return inserted;
}

async function enrichHero(db: SupabaseClient, row: Record<string, unknown> | null) {
  if (!row) {
    return {
      id: HERO_ID,
      enabled: false,
      restaurant_id: null,
      image_url: null,
      use_restaurant_image: true,
      restaurant: null,
      show_merchant_grid: true,
      hidden_restaurant_ids: [],
    };
  }

  const enabled = row.enabled === true;
  let restaurant = null;
  if (enabled && row.restaurant_id) {
    const { data } = await db
      .from("restaurants")
      .select("restaurant_id,name,description,cuisine,image_url,cover_url,rating,delivery_time_min,merchant_category_slug")
      .eq("restaurant_id", row.restaurant_id)
      .maybeSingle();
    restaurant = data || null;
  }

  const customImage = row.image_url ? String(row.image_url) : null;
  const restaurantImage = restaurant?.image_url || restaurant?.cover_url || null;
  const resolvedImageUrl = enabled
    ? (row.use_restaurant_image === false ? customImage : (restaurantImage || customImage))
    : null;

  return {
    id: row.id,
    enabled,
    restaurant_id: enabled ? (row.restaurant_id || null) : null,
    image_url: resolvedImageUrl,
    custom_image_url: customImage,
    use_restaurant_image: row.use_restaurant_image !== false,
    restaurant: enabled ? restaurant : null,
    show_merchant_grid: row.show_merchant_grid !== false,
    hidden_restaurant_ids: hiddenIds(row),
    updated_at: row.updated_at,
  };
}

async function filterDispensaryRows(db: SupabaseClient, rows: Record<string, unknown>[]) {
  const dispensaryIds = rows
    .filter((r) => r.merchant_category_slug === "licensed_dispensary")
    .map((r) => String(r.restaurant_id));
  if (!dispensaryIds.length) return rows;

  const { data: profiles } = await db
    .from("merchant_compliance_profiles")
    .select("merchant_id, verification_status")
    .in("merchant_id", dispensaryIds)
    .eq("verification_status", "approved");
  const approvedDispensaries = new Set((profiles || []).map((p) => String(p.merchant_id)));
  return rows.filter(
    (r) =>
      r.merchant_category_slug !== "licensed_dispensary" ||
      approvedDispensaries.has(String(r.restaurant_id))
  );
}

async function listHomepageMerchants(db: SupabaseClient, params: Record<string, string> = {}) {
  const row = await getHeroRow(db);
  if (row?.show_merchant_grid === false) return [];

  const hidden = new Set(hiddenIds(row as Record<string, unknown>));
  const { data: enabledCats } = await db.from("merchant_categories").select("slug").eq("enabled", true);
  const enabledSlugs = (enabledCats || []).map((c) => c.slug as string);

  let q = db
    .from("restaurants")
    .select("*")
    .eq("approved", true)
    .eq("active", true)
    .not("name", "ilike", "TEST_%")
    .order("rating", { ascending: false });

  const search = (params.q || "").trim().slice(0, 120);
  const cuisine = (params.cuisine || "").trim().slice(0, 80);
  const merchantCategory = (params.merchant_category || params.category_slug || "").trim().slice(0, 80);

  if (search) {
    q = q.or(
      `name.ilike.%${search}%,description.ilike.%${search}%,cuisine.ilike.%${search}%,primary_category.ilike.%${search}%`
    );
  }
  if (cuisine) q = q.ilike("cuisine", `%${cuisine}%`);
  if (merchantCategory) {
    q = q.eq("merchant_category_slug", merchantCategory);
  } else if (enabledSlugs.length) {
    q = q.in("merchant_category_slug", enabledSlugs);
  }

  const { data, error } = await q;
  if (error) throwErr(error.message, 500);

  let rows = filterPublicRestaurants(data || []).filter((r) => !hidden.has(String(r.restaurant_id)));
  rows = await filterDispensaryRows(db, rows as Record<string, unknown>[]);
  return finalizePublicRestaurantList(rows, params);
}

async function updateHiddenMerchants(
  db: SupabaseClient,
  updatedBy: string,
  updater: (current: string[]) => string[]
) {
  const row = await getHeroRow(db);
  const next = updater(hiddenIds(row as Record<string, unknown>));
  const { data, error } = await db
    .from("homepage_hero")
    .update({
      hidden_restaurant_ids: next,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", HERO_ID)
    .select()
    .single();
  if (error) throwErr(error.message, 500);
  return enrichHero(db, data as Record<string, unknown>);
}

export async function handleHeroRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (path === "/homepage/hero" && method === "GET") {
    const row = await getHeroRow(db);
    return enrichHero(db, row as Record<string, unknown> | null);
  }

  if (path === "/homepage/merchants" && method === "GET") {
    return listHomepageMerchants(db, params);
  }

  if (path === "/admin/hero" && method === "GET") {
    ctx.requireRole("admin");
    const row = await getHeroRow(db);
    return enrichHero(db, row as Record<string, unknown> | null);
  }

  if (path === "/admin/hero" && method === "PUT") {
    const admin = ctx.requireRole("admin");
    const restaurantId = body.restaurant_id ? String(body.restaurant_id) : null;
    const wantsEnabled = body.enabled === true && Boolean(restaurantId);

    if (wantsEnabled && restaurantId) {
      const { data: restaurant } = await db
        .from("restaurants")
        .select("restaurant_id")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (!restaurant) throwErr("Restaurant not found", 404);
    }

    if (!wantsEnabled) {
      const data = await clearHeroRow(db, String(admin.user_id));
      const enriched = await enrichHero(db, data as Record<string, unknown>);
      if (body.show_merchant_grid !== undefined || body.hidden_restaurant_ids !== undefined) {
        const patch: Record<string, unknown> = {
          updated_by: admin.user_id,
          updated_at: new Date().toISOString(),
        };
        if (body.show_merchant_grid !== undefined) patch.show_merchant_grid = body.show_merchant_grid === true;
        if (body.hidden_restaurant_ids !== undefined) {
          patch.hidden_restaurant_ids = Array.isArray(body.hidden_restaurant_ids)
            ? body.hidden_restaurant_ids.map(String)
            : [];
        }
        await db.from("homepage_hero").update(patch).eq("id", HERO_ID);
        const row = await getHeroRow(db);
        return enrichHero(db, row as Record<string, unknown> | null);
      }
      return enriched;
    }

    const patch: Record<string, unknown> = {
      enabled: true,
      restaurant_id: restaurantId,
      use_restaurant_image: body.use_restaurant_image !== false,
      updated_by: admin.user_id,
      updated_at: new Date().toISOString(),
    };

    if (body.image_url !== undefined) {
      patch.image_url = body.image_url ? String(body.image_url) : null;
    }
    if (body.image_storage_path !== undefined) {
      patch.image_storage_path = body.image_storage_path ? String(body.image_storage_path) : null;
    }
    if (body.show_merchant_grid !== undefined) {
      patch.show_merchant_grid = body.show_merchant_grid === true;
    }
    if (body.hidden_restaurant_ids !== undefined) {
      patch.hidden_restaurant_ids = Array.isArray(body.hidden_restaurant_ids)
        ? body.hidden_restaurant_ids.map(String)
        : [];
    }

    await ensureHeroRow(db);
    const { data, error } = await db
      .from("homepage_hero")
      .update(patch)
      .eq("id", HERO_ID)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return enrichHero(db, data as Record<string, unknown>);
  }

  if (path === "/admin/hero/clear" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const data = await clearHeroRow(db, String(admin.user_id));
    return enrichHero(db, data as Record<string, unknown>);
  }

  if (path === "/admin/hero/merchants/hide" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const restaurantId = String(body.restaurant_id || "");
    if (!restaurantId) throwErr("restaurant_id required");
    return updateHiddenMerchants(db, String(admin.user_id), (current) =>
      current.includes(restaurantId) ? current : [...current, restaurantId]
    );
  }

  if (path === "/admin/hero/merchants/show" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const restaurantId = String(body.restaurant_id || "");
    if (!restaurantId) throwErr("restaurant_id required");
    return updateHiddenMerchants(db, String(admin.user_id), (current) =>
      current.filter((id) => id !== restaurantId)
    );
  }

  if (path === "/admin/hero/merchants/clear-all" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const { data: merchants } = await db
      .from("restaurants")
      .select("restaurant_id")
      .eq("approved", true)
      .eq("active", true)
      .not("name", "ilike", "TEST_%");
    const allIds = (merchants || []).map((r) => String(r.restaurant_id));
    const { data, error } = await db
      .from("homepage_hero")
      .update({
        hidden_restaurant_ids: allIds,
        show_merchant_grid: false,
        updated_by: admin.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", HERO_ID)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return enrichHero(db, data as Record<string, unknown>);
  }

  if (path === "/admin/hero/merchants/restore-all" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const { data, error } = await db
      .from("homepage_hero")
      .update({
        hidden_restaurant_ids: [],
        show_merchant_grid: true,
        updated_by: admin.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", HERO_ID)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return enrichHero(db, data as Record<string, unknown>);
  }

  if (path === "/admin/hero/image/presign" && method === "POST") {
    ctx.requireRole("admin");
    const fileName = String(body.file_name || "hero.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = String(body.content_type || "image/jpeg");
    const storagePath = `admin/${Date.now()}_${fileName}`;
    const { data: signed, error } = await db.storage
      .from(HERO_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !signed) throwErr(error?.message || "Could not create upload URL", 500);
    return {
      upload_url: signed.signedUrl,
      storage_path: storagePath,
      public_url: publicStorageUrl(storagePath),
      token: signed.token,
      content_type: contentType,
    };
  }

  return null;
}
