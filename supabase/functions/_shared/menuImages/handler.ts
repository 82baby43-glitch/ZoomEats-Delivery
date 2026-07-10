import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MENU_ENHANCE_FREE_LIMIT,
  MENU_ENHANCE_PRESET,
  getPhotoroomApiKey,
  publicMenuImageUrl,
} from "./config.ts";
import { enhanceMenuImageCleanBright } from "./photoroom.ts";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

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

async function countEnhancements(db: SupabaseClient, restaurantId: string) {
  const { count } = await db
    .from("restaurant_menu_enhancements")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  return count ?? 0;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "menu.jpg";
}

export async function handleMenuImageRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {} } = ctx;

  if (path === "/vendor/menu-images/quota" && method === "GET") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) return { used: 0, limit: MENU_ENHANCE_FREE_LIMIT, remaining: MENU_ENHANCE_FREE_LIMIT };
    const used = await countEnhancements(db, restaurant.restaurant_id);
    return {
      used,
      limit: MENU_ENHANCE_FREE_LIMIT,
      remaining: Math.max(0, MENU_ENHANCE_FREE_LIMIT - used),
      preset: MENU_ENHANCE_PRESET,
      preset_label: "Clean & bright",
    };
  }

  if (path === "/vendor/menu-images/presign" && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) throwErr("Create your restaurant profile first", 400);

    const fileName = sanitizeFileName(String(body.file_name || "menu.jpg"));
    const storagePath = `${restaurant.restaurant_id}/originals/${Date.now()}_${fileName}`;
    const { data: signed, error } = await db.storage
      .from("menu-images")
      .createSignedUploadUrl(storagePath);
    if (error || !signed) throwErr(error?.message || "Could not create upload URL", 500);

    return {
      upload_url: signed.signedUrl,
      storage_path: storagePath,
      token: signed.token,
      content_type: String(body.content_type || "image/jpeg"),
    };
  }

  if (path === "/vendor/menu-images/enhance" && method === "POST") {
    const u = ctx.requireRole("vendor", "restaurant");
    const restaurant = await getVendorRestaurant(db, String(u.user_id));
    if (!restaurant) throwErr("Create your restaurant profile first", 400);

    const storagePath = String(body.storage_path || "");
    if (!storagePath.startsWith(`${restaurant.restaurant_id}/`)) {
      throwErr("Invalid storage path", 403);
    }

    const used = await countEnhancements(db, restaurant.restaurant_id);
    if (used >= MENU_ENHANCE_FREE_LIMIT) {
      throwErr(
        `Free enhancement limit reached (${MENU_ENHANCE_FREE_LIMIT} per restaurant). Contact ZoomEats for more.`,
        402
      );
    }

    const apiKey = getPhotoroomApiKey();
    if (!apiKey) throwErr("Menu image enhancement is not configured (PHOTOROOM_API_KEY missing)", 503);

    const { data: originalBlob, error: dlError } = await db.storage
      .from("menu-images")
      .download(storagePath);
    if (dlError || !originalBlob) throwErr(dlError?.message || "Could not read uploaded image", 400);

    const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
    const fileName = storagePath.split("/").pop() || "menu.jpg";
    const enhanced = await enhanceMenuImageCleanBright(originalBytes, fileName, apiKey);

    const enhancedPath = `${restaurant.restaurant_id}/enhanced/${Date.now()}_clean_bright.jpg`;
    const { error: upError } = await db.storage
      .from("menu-images")
      .upload(enhancedPath, enhanced.bytes, {
        contentType: enhanced.contentType,
        upsert: false,
      });
    if (upError) throwErr(upError.message, 500);

    await db.from("restaurant_menu_enhancements").insert({
      restaurant_id: restaurant.restaurant_id,
      preset: MENU_ENHANCE_PRESET,
      original_storage_path: storagePath,
      enhanced_storage_path: enhancedPath,
      created_by: String(u.user_id),
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const originalUrl = publicMenuImageUrl(supabaseUrl, storagePath);
    const enhancedUrl = publicMenuImageUrl(supabaseUrl, enhancedPath);
    const remaining = Math.max(0, MENU_ENHANCE_FREE_LIMIT - used - 1);

    return {
      preset: MENU_ENHANCE_PRESET,
      preset_label: "Clean & bright",
      original_url: originalUrl,
      enhanced_url: enhancedUrl,
      image_url: enhancedUrl,
      remaining,
      used: used + 1,
      limit: MENU_ENHANCE_FREE_LIMIT,
    };
  }

  return null;
}
