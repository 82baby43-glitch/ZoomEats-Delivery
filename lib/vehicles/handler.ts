import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteStoragePaths, isAllowedImageType, publicStorageUrl, sanitizeImageFileName } from "../profiles/helpers";
import { VEHICLE_TYPES } from "../profiles/types";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

async function requireDriver(db: SupabaseClient, userId: string) {
  const { data } = await db.from("drivers").select("driver_id").eq("user_id", userId).maybeSingle();
  if (!data?.driver_id) throwErr("Driver profile not found", 404);
  return data.driver_id as string;
}

async function enrichVehicle(db: SupabaseClient, vehicle: Record<string, unknown>) {
  const { data: photos } = await db
    .from("vehicle_photos")
    .select("*")
    .eq("vehicle_id", vehicle.id)
    .order("display_order", { ascending: true });
  return {
    ...vehicle,
    photos: (photos || []).map((p) => ({
      ...p,
      photo_url: publicStorageUrl("vehicle-images", p.photo_url),
      thumbnail_url: p.thumbnail_url ? publicStorageUrl("vehicle-images", p.thumbnail_url) : null,
    })),
  };
}

export async function getActiveVehicleForDriver(db: SupabaseClient, driverId: string) {
  const { data: vehicle } = await db
    .from("driver_vehicles")
    .select("*")
    .eq("driver_id", driverId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!vehicle) return null;
  return enrichVehicle(db, vehicle);
}

export async function getActiveVehicleForOrder(db: SupabaseClient, driverId: string) {
  const vehicle = await getActiveVehicleForDriver(db, driverId);
  if (!vehicle) return null;
  const v = vehicle as Record<string, unknown>;
  const photos = Array.isArray(v.photos) ? v.photos as Array<Record<string, unknown>> : [];
  const front = photos.find((p) => p.photo_type === "front") || photos[0];
  return {
    id: v.id,
    vehicle_type: v.vehicle_type,
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    license_plate: v.license_plate,
    nickname: v.nickname,
    photo_url: (front?.photo_url as string | undefined) || null,
    thumbnail_url: (front?.thumbnail_url as string | undefined) || (front?.photo_url as string | undefined) || null,
    label: [v.color, v.make, v.model].filter(Boolean).join(" "),
  };
}

export async function handleVehicleRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {} } = ctx;

  if (path === "/driver/vehicles" && method === "GET") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const { data } = await db
      .from("driver_vehicles")
      .select("*")
      .eq("driver_id", driverId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
    const enriched = await Promise.all((data || []).map((v) => enrichVehicle(db, v)));
    return { vehicles: enriched, vehicle_types: VEHICLE_TYPES };
  }

  if (path === "/driver/vehicles" && method === "POST") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleType = String(body.vehicle_type || "car");
    if (!VEHICLE_TYPES.some((t) => t.id === vehicleType)) throwErr("Invalid vehicle type");

    const { count } = await db
      .from("driver_vehicles")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", driverId);
    const makeActive = Boolean(body.is_active) || (count || 0) === 0;

    if (makeActive) {
      await db.from("driver_vehicles").update({ is_active: false }).eq("driver_id", driverId);
    }

    const { data, error } = await db
      .from("driver_vehicles")
      .insert({
        driver_id: driverId,
        nickname: body.nickname ? String(body.nickname) : null,
        vehicle_type: vehicleType,
        make: body.make ? String(body.make) : null,
        model: body.model ? String(body.model) : null,
        year: body.year != null ? Number(body.year) : null,
        color: body.color ? String(body.color) : null,
        license_plate: body.license_plate ? String(body.license_plate) : null,
        fuel_type: body.fuel_type ? String(body.fuel_type) : null,
        delivery_capacity: body.delivery_capacity ? String(body.delivery_capacity) : null,
        is_active: makeActive,
      })
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return enrichVehicle(db, data);
  }

  const vehicleIdMatch = path.match(/^\/driver\/vehicles\/([^/]+)$/);
  if (vehicleIdMatch && method === "PUT") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleId = vehicleIdMatch[1];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["nickname", "vehicle_type", "make", "model", "color", "license_plate", "fuel_type", "delivery_capacity"]) {
      if (body[key] !== undefined) patch[key] = body[key] ? String(body[key]) : null;
    }
    if (body.year !== undefined) patch.year = body.year != null ? Number(body.year) : null;

    const { data, error } = await db
      .from("driver_vehicles")
      .update(patch)
      .eq("id", vehicleId)
      .eq("driver_id", driverId)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return enrichVehicle(db, data);
  }

  if (vehicleIdMatch && method === "DELETE") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleId = vehicleIdMatch[1];
    const { data: photos } = await db.from("vehicle_photos").select("photo_url,thumbnail_url").eq("vehicle_id", vehicleId);
    await deleteStoragePaths(
      db,
      "vehicle-images",
      (photos || []).flatMap((p) => [p.photo_url, p.thumbnail_url])
    );
    await db.from("vehicle_photos").delete().eq("vehicle_id", vehicleId);
    await db.from("driver_vehicles").delete().eq("id", vehicleId).eq("driver_id", driverId);
    return { ok: true };
  }

  const activateMatch = path.match(/^\/driver\/vehicles\/([^/]+)\/activate$/);
  if (activateMatch && method === "POST") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleId = activateMatch[1];
    await db.from("driver_vehicles").update({ is_active: false }).eq("driver_id", driverId);
    const { data, error } = await db
      .from("driver_vehicles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", vehicleId)
      .eq("driver_id", driverId)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return enrichVehicle(db, data);
  }

  const photoPresignMatch = path.match(/^\/driver\/vehicles\/([^/]+)\/photos\/presign$/);
  if (photoPresignMatch && method === "POST") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleId = photoPresignMatch[1];
    const { data: vehicle } = await db
      .from("driver_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (!vehicle) throwErr("Vehicle not found", 404);

    const contentType = String(body.content_type || "image/jpeg").toLowerCase();
    if (!isAllowedImageType(contentType)) throwErr("Unsupported image type");
    const variant = body.variant === "thumbnail" ? "thumbnail" : "full";
    const photoType = String(body.photo_type || "front");
    const fileName = sanitizeImageFileName(String(body.file_name || `${photoType}.jpg`));
    const storagePath = `${driverId}/${vehicleId}/${photoType}/${variant}/${fileName}`;
    const { data: signed, error } = await db.storage.from("vehicle-images").createSignedUploadUrl(storagePath);
    if (error || !signed) throwErr(error?.message || "Could not create upload URL", 500);
    return {
      upload_url: signed.signedUrl,
      storage_path: storagePath,
      token: signed.token,
      content_type: contentType,
      variant,
      photo_type: photoType,
    };
  }

  const photoCompleteMatch = path.match(/^\/driver\/vehicles\/([^/]+)\/photos\/complete$/);
  if (photoCompleteMatch && method === "POST") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleId = photoCompleteMatch[1];
    const photoType = String(body.photo_type || "front");
    const fullPath = String(body.full_path || "");
    const thumbPath = String(body.thumbnail_path || "");
    if (!fullPath.startsWith(`${driverId}/${vehicleId}/`)) throwErr("Invalid storage path", 403);

    const { data: existing } = await db
      .from("vehicle_photos")
      .select("id,photo_url,thumbnail_url")
      .eq("vehicle_id", vehicleId)
      .eq("photo_type", photoType)
      .maybeSingle();

    if (existing) {
      await deleteStoragePaths(db, "vehicle-images", [existing.photo_url, existing.thumbnail_url]);
      await db.from("vehicle_photos").delete().eq("id", existing.id);
    }

    const { data, error } = await db
      .from("vehicle_photos")
      .insert({
        vehicle_id: vehicleId,
        photo_url: fullPath,
        thumbnail_url: thumbPath || fullPath,
        photo_type: photoType,
        display_order: Number(body.display_order) || 0,
      })
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return {
      ...data,
      photo_url: publicStorageUrl("vehicle-images", data.photo_url),
      thumbnail_url: publicStorageUrl("vehicle-images", data.thumbnail_url || data.photo_url),
    };
  }

  const photoDeleteMatch = path.match(/^\/driver\/vehicles\/([^/]+)\/photos\/([^/]+)$/);
  if (photoDeleteMatch && method === "DELETE") {
    const user = ctx.requireRole("delivery");
    const driverId = await requireDriver(db, String(user.user_id));
    const vehicleId = photoDeleteMatch[1];
    const photoId = photoDeleteMatch[2];
    const { data: vehicle } = await db
      .from("driver_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (!vehicle) throwErr("Vehicle not found", 404);

    const { data: photo } = await db.from("vehicle_photos").select("*").eq("id", photoId).eq("vehicle_id", vehicleId).maybeSingle();
    if (photo) {
      await deleteStoragePaths(db, "vehicle-images", [photo.photo_url, photo.thumbnail_url]);
      await db.from("vehicle_photos").delete().eq("id", photoId);
    }
    return { ok: true };
  }

  return null;
}
