import type { SupabaseClient } from "@supabase/supabase-js";

const HERO_ID = "default";
const HERO_BUCKET = "hero-images";

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function publicStorageUrl(storagePath: string): string {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${HERO_BUCKET}/${storagePath}`;
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
    updated_at: row.updated_at,
  };
}

export async function handleHeroRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {} } = ctx;

  if (path === "/homepage/hero" && method === "GET") {
    const row = await getHeroRow(db);
    return enrichHero(db, row as Record<string, unknown> | null);
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
      return enrichHero(db, data as Record<string, unknown>);
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
