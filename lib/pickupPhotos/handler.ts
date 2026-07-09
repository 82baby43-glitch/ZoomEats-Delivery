import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseDriverApis } from "../founderDriver/auth";
import { canAccessFounderDashboard } from "../founderDriver/auth";
import { buildChecklist, mergePickupGuide, type PickupPhotoType } from "./instructions";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

async function signedPhotoUrl(db: SupabaseClient, storagePath: string) {
  const { data } = await db.storage.from("pickup-photos").createSignedUrl(storagePath, 3600);
  return data?.signedUrl;
}

async function loadInstructionView(
  db: SupabaseClient,
  orderId: string,
  userId: string
) {
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) throwErr("Order not found", 404);

  const { data: restaurant } = order.restaurant_id
    ? await db.from("restaurants").select("restaurant_id,name,address").eq("restaurant_id", order.restaurant_id).maybeSingle()
    : { data: null };

  const { data: guide } = order.restaurant_id
    ? await db.from("restaurant_pickup_guides").select("*").eq("restaurant_id", order.restaurant_id).maybeSingle()
    : { data: null };

  const { data: photos } = order.restaurant_id
    ? await db
        .from("pickup_photos")
        .select("photo_id,photo_type,caption,storage_path,created_at,user_id")
        .eq("restaurant_id", order.restaurant_id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(24)
    : { data: [] };

  const uploadedTypes = new Set(
    (photos || []).filter((p) => p.user_id === userId && p.order_id === orderId).map((p) => p.photo_type)
  );

  const merged = mergePickupGuide(String(restaurant?.name || order.restaurant_name || "Restaurant"), guide);
  const photoRows = await Promise.all(
    (photos || []).map(async (p) => ({
      photo_id: p.photo_id,
      photo_type: p.photo_type as PickupPhotoType,
      caption: p.caption || undefined,
      created_at: p.created_at,
      mine: p.user_id === userId,
      url: await signedPhotoUrl(db, p.storage_path),
    }))
  );

  return {
    order_id: orderId,
    restaurant_id: String(order.restaurant_id || restaurant?.restaurant_id || ""),
    restaurant_address: restaurant?.address || undefined,
    ...merged,
    checklist: buildChecklist(uploadedTypes),
    photos: photoRows,
  };
}

export async function handlePickupPhotoRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body: Record<string, unknown>;
    params: Record<string, string>;
    requireAuth: () => Record<string, unknown>;
    requireRole: (...roles: string[]) => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body, params } = opts;

  const instructionsMatch = path.match(/^\/driver\/pickup-instructions\/([^/]+)$/);
  if (instructionsMatch && method === "GET") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery or founder driver access required", 403);
    }
    return loadInstructionView(db, instructionsMatch[1], String(u.user_id));
  }

  if (path === "/driver/pickup-photos/presign" && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery or founder driver access required", 403);
    }
    const orderId = String(body.order_id || "");
    const photoType = String(body.photo_type || "") as PickupPhotoType;
    const fileName = String(body.file_name || "pickup.jpg");
    const contentType = String(body.content_type || "image/jpeg");
    if (!orderId || !photoType) throwErr("order_id and photo_type required");

    const { data: order } = await db.from("orders").select("restaurant_id").eq("order_id", orderId).maybeSingle();
    if (!order?.restaurant_id) throwErr("Order not found", 404);

    const photoId = uid("pup");
    const storagePath = `${order.restaurant_id}/${orderId}/${photoType}_${Date.now()}_${fileName}`;
    const { data: signed, error } = await db.storage.from("pickup-photos").createSignedUploadUrl(storagePath);
    if (error) throwErr(error.message, 500);

    await db.from("pickup_photos").insert({
      photo_id: photoId,
      order_id: orderId,
      restaurant_id: order.restaurant_id,
      user_id: String(u.user_id),
      photo_type: photoType,
      storage_path: storagePath,
      caption: body.caption ? String(body.caption) : null,
      latitude: body.latitude != null ? Number(body.latitude) : null,
      longitude: body.longitude != null ? Number(body.longitude) : null,
      status: "uploading",
    });

    return {
      photo_id: photoId,
      upload_url: signed?.signedUrl,
      storage_path: storagePath,
      token: signed?.token,
      content_type: contentType,
    };
  }

  if (path === "/driver/pickup-photos/complete" && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery or founder driver access required", 403);
    }
    const photoId = String(body.photo_id || "");
    if (!photoId) throwErr("photo_id required");

    const { data: photo } = await db
      .from("pickup_photos")
      .select("*")
      .eq("photo_id", photoId)
      .eq("user_id", String(u.user_id))
      .maybeSingle();
    if (!photo) throwErr("Photo not found", 404);

    await db.from("pickup_photos").update({ status: "active" }).eq("photo_id", photoId);
    return loadInstructionView(db, photo.order_id, String(u.user_id));
  }

  if (path === "/founder-driver/pickup-instructions" && method === "GET") {
    const u = opts.requireAuth();
    if (!canAccessFounderDashboard(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Founder Driver access required", 403);
    }
    const orderId = String(params.order_id || body.order_id || "");
    if (!orderId) throwErr("order_id required");
    return loadInstructionView(db, orderId, String(u.user_id));
  }

  if (path === "/founder-driver/pickup-guides" && method === "POST") {
    const u = opts.requireAuth();
    if (!canAccessFounderDashboard(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Founder Driver access required", 403);
    }
    const restaurantId = String(body.restaurant_id || "");
    if (!restaurantId) throwErr("restaurant_id required");

    const row = {
      restaurant_id: restaurantId,
      entrance_instructions: body.entrance_instructions ? String(body.entrance_instructions) : null,
      parking_instructions: body.parking_instructions ? String(body.parking_instructions) : null,
      counter_instructions: body.counter_instructions ? String(body.counter_instructions) : null,
      shelf_location: body.shelf_location ? String(body.shelf_location) : null,
      pickup_notes: body.pickup_notes ? String(body.pickup_notes) : null,
      updated_by: String(u.user_id),
      updated_at: new Date().toISOString(),
    };
    await db.from("restaurant_pickup_guides").upsert(row);
    return { ok: true, guide: row };
  }

  if (path === "/founder-driver/pickup-photos" && method === "GET") {
    const u = opts.requireAuth();
    if (!canAccessFounderDashboard(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Founder Driver access required", 403);
    }
    const restaurantId = String(params.restaurant_id || body.restaurant_id || "");
    let q = db
      .from("pickup_photos")
      .select("photo_id,order_id,restaurant_id,photo_type,caption,storage_path,created_at,user_id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);
    if (restaurantId) q = q.eq("restaurant_id", restaurantId);
    const { data: photos } = await q;
    const rows = await Promise.all(
      (photos || []).map(async (p) => ({
        ...p,
        url: await signedPhotoUrl(db, p.storage_path),
      }))
    );
    return { photos: rows };
  }

  return null;
}
