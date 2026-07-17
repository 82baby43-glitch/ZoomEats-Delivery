import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDisplayName,
  deleteStoragePaths,
  isAllowedImageType,
  parseNameParts,
  publicStorageUrl,
  sanitizeImageFileName,
} from "./helpers.ts";
import type { ProfilePayload } from "./types.ts";

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

async function getDriverRow(db: SupabaseClient, userId: string) {
  const { data } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

async function buildProfilePayload(db: SupabaseClient, user: Record<string, unknown>): Promise<ProfilePayload> {
  const userId = String(user.user_id);
  const { data: row } = await db.from("users").select("*").eq("user_id", userId).maybeSingle();
  if (!row) throwErr("User not found", 404);

  const { firstName, lastName } = parseNameParts(row.name, row.first_name, row.last_name);
  const displayName = buildDisplayName(row.display_name, firstName, lastName, row.name);
  const profilePhoto = row.profile_photo_url
    ? publicStorageUrl("profile-images", row.profile_photo_url)
    : row.picture || null;
  const thumbnailPhoto = row.thumbnail_photo_url
    ? publicStorageUrl("profile-images", row.thumbnail_photo_url)
    : profilePhoto;

  const payload: ProfilePayload = {
    user_id: userId,
    email: String(row.email || ""),
    role: String(row.role || "customer"),
    account_type: String(row.role || "customer"),
    member_since: row.created_at ? String(row.created_at) : null,
    account_status: row.active === false ? "suspended" : String(row.approval_status || "approved"),
    first_name: firstName || null,
    last_name: lastName || null,
    display_name: displayName,
    name: row.name ? String(row.name) : displayName,
    phone: row.phone ? String(row.phone) : null,
    picture: row.picture ? String(row.picture) : null,
    profile_photo_url: profilePhoto,
    thumbnail_photo_url: thumbnailPhoto,
    profile_photo_status: row.profile_photo_status ? String(row.profile_photo_status) : "approved",
  };

  if (row.role === "delivery") {
    const driver = await getDriverRow(db, userId);
    const { count: totalDeliveries } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", driver?.driver_id || "")
      .eq("status", "delivered");

    const { count: assigned } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", driver?.driver_id || "");

    const delivered = totalDeliveries || 0;
    const total = assigned || 0;
    payload.driver_stats = {
      rating: 4.9,
      total_deliveries: delivered,
      completion_rate: total > 0 ? Math.round((delivered / total) * 1000) / 10 : 100,
      online: Boolean(driver?.availability),
      background_check_status: "pending_review",
      insurance_status: "not_submitted",
    };
  }

  if (row.role === "vendor" || row.role === "restaurant") {
    const { data: rest } = await db
      .from("restaurants")
      .select("name,image_url,cover_url,phone,opening_hours")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rest) {
      payload.merchant = {
        restaurant_name: rest.name,
        logo_url: rest.image_url,
        cover_url: rest.cover_url,
        phone: rest.phone,
        hours: rest.opening_hours,
      };
    }
  }

  return payload;
}

export async function handleProfileRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (path === "/profile" && method === "GET") {
    const user = ctx.requireAuth();
    return buildProfilePayload(db, user);
  }

  if (path === "/profile" && method === "PUT") {
    const user = ctx.requireAuth();
    const userId = String(user.user_id);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.first_name !== undefined) patch.first_name = String(body.first_name || "").trim() || null;
    if (body.last_name !== undefined) patch.last_name = String(body.last_name || "").trim() || null;
    if (body.display_name !== undefined) patch.display_name = String(body.display_name || "").trim() || null;
    if (body.phone !== undefined) patch.phone = String(body.phone || "").trim() || null;

    const first = body.first_name !== undefined ? String(body.first_name || "").trim() : undefined;
    const last = body.last_name !== undefined ? String(body.last_name || "").trim() : undefined;
    if (first !== undefined || last !== undefined) {
      const { data: existing } = await db.from("users").select("first_name,last_name,name").eq("user_id", userId).maybeSingle();
      const parts = parseNameParts(
        existing?.name,
        first ?? existing?.first_name,
        last ?? existing?.last_name
      );
      patch.name = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim() || existing?.name;
    }

    const { data, error } = await db.from("users").update(patch).eq("user_id", userId).select().single();
    if (error) throwErr(error.message, 500);
    return buildProfilePayload(db, { ...user, ...data });
  }

  if (path === "/profile/photo/presign" && method === "POST") {
    const user = ctx.requireAuth();
    const contentType = String(body.content_type || "image/jpeg").toLowerCase();
    if (!isAllowedImageType(contentType)) throwErr("Unsupported image type");
    const variant = body.variant === "thumbnail" ? "thumbnail" : "full";
    const fileName = sanitizeImageFileName(String(body.file_name || "profile.jpg"));
    const storagePath = `${user.user_id}/${variant}/${fileName}`;
    const { data: signed, error } = await db.storage.from("profile-images").createSignedUploadUrl(storagePath);
    if (error || !signed) throwErr(error?.message || "Could not create upload URL", 500);
    return {
      upload_url: signed.signedUrl,
      storage_path: storagePath,
      token: signed.token,
      content_type: contentType,
      variant,
    };
  }

  if (path === "/profile/photo/complete" && method === "POST") {
    const user = ctx.requireAuth();
    const userId = String(user.user_id);
    const fullPath = String(body.full_path || "");
    const thumbPath = String(body.thumbnail_path || "");
    if (!fullPath.startsWith(`${userId}/`)) throwErr("Invalid storage path", 403);

    const { data: existing } = await db
      .from("users")
      .select("profile_photo_url,thumbnail_photo_url")
      .eq("user_id", userId)
      .maybeSingle();

    await deleteStoragePaths(db, "profile-images", [
      existing?.profile_photo_url,
      existing?.thumbnail_photo_url,
    ]);

    const { error } = await db.from("users").update({
      profile_photo_url: fullPath,
      thumbnail_photo_url: thumbPath || fullPath,
      profile_photo_status: "approved",
      picture: publicStorageUrl("profile-images", fullPath),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (error) throwErr(error.message, 500);

    return {
      ok: true,
      profile_photo_url: publicStorageUrl("profile-images", fullPath),
      thumbnail_photo_url: publicStorageUrl("profile-images", thumbPath || fullPath),
    };
  }

  if (path === "/profile/photo" && method === "DELETE") {
    const user = ctx.requireAuth();
    const userId = String(user.user_id);
    const { data: existing } = await db
      .from("users")
      .select("profile_photo_url,thumbnail_photo_url,picture")
      .eq("user_id", userId)
      .maybeSingle();

    await deleteStoragePaths(db, "profile-images", [
      existing?.profile_photo_url,
      existing?.thumbnail_photo_url,
    ]);

    await db.from("users").update({
      profile_photo_url: null,
      thumbnail_photo_url: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return { ok: true };
  }

  if (path === "/admin/profiles" && method === "GET") {
    ctx.requireRole("admin");
    const q = String(params.q || "").trim().toLowerCase();
    let query = db
      .from("users")
      .select("user_id,name,email,role,profile_photo_url,thumbnail_photo_url,profile_photo_status,phone,created_at,picture")
      .order("created_at", { ascending: false })
      .limit(100);

    if (params.missing_photo === "1") {
      query = query.is("profile_photo_url", null);
    }

    const { data: users } = await query;
    let rows = users || [];
    if (q) {
      rows = rows.filter((u) =>
        [u.name, u.email, u.role, u.phone].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }

    const driverIds = rows.filter((u) => u.role === "delivery").map((u) => u.user_id);
    const vehiclesByUser: Record<string, unknown[]> = {};
    if (driverIds.length) {
      const { data: drivers } = await db.from("drivers").select("driver_id,user_id").in("user_id", driverIds);
      const driverMap = Object.fromEntries((drivers || []).map((d) => [d.user_id, d.driver_id]));
      const driverIdList = Object.values(driverMap);
      const { data: vehicles } = driverIdList.length
        ? await db.from("driver_vehicles").select("vehicle_id,driver_id,make,model,color,is_active,mode_key").in("driver_id", driverIdList)
        : { data: [] };
      const { data: photos } = (vehicles || []).length
        ? await db.from("vehicle_photos").select("vehicle_id,photo_type").in("vehicle_id", (vehicles || []).map((v) => v.vehicle_id))
        : { data: [] };
      const photoMap = new Map<string, string[]>();
      for (const p of photos || []) {
        const vid = String(p.vehicle_id);
        if (!photoMap.has(vid)) photoMap.set(vid, []);
        photoMap.get(vid)!.push(String(p.photo_type));
      }
      for (const [uid, driverId] of Object.entries(driverMap)) {
        vehiclesByUser[uid] = (vehicles || [])
          .filter((v) => v.driver_id === driverId)
          .map((v) => ({
            ...v,
            id: v.vehicle_id,
            vehicle_type: v.mode_key,
            photo_types: photoMap.get(String(v.vehicle_id)) || [],
            missing_front_photo: !(photoMap.get(String(v.vehicle_id)) || []).includes("front"),
          }));
      }
    }

    return rows.map((u) => ({
      ...u,
      profile_photo_url: u.profile_photo_url ? publicStorageUrl("profile-images", u.profile_photo_url) : u.picture,
      thumbnail_photo_url: u.thumbnail_photo_url
        ? publicStorageUrl("profile-images", u.thumbnail_photo_url)
        : null,
      missing_profile_photo: !u.profile_photo_url && !u.picture,
      vehicles: vehiclesByUser[u.user_id] || [],
    }));
  }

  const moderateMatch = path.match(/^\/admin\/profiles\/([^/]+)\/moderate$/);
  if (moderateMatch && method === "POST") {
    ctx.requireRole("admin");
    const status = String(body.status || "approved");
    if (!["approved", "rejected", "pending"].includes(status)) throwErr("Invalid status");
    await db.from("users").update({
      profile_photo_status: status,
      updated_at: new Date().toISOString(),
    }).eq("user_id", moderateMatch[1]);
    return { ok: true, user_id: moderateMatch[1], profile_photo_status: status };
  }

  return null;
}

export async function getPublicProfileForUser(
  db: SupabaseClient,
  userId: string
): Promise<{ name: string; first_name: string; profile_photo_url: string | null; thumbnail_photo_url: string | null; rating?: number } | null> {
  const { data: row } = await db
    .from("users")
    .select("name,first_name,last_name,display_name,profile_photo_url,thumbnail_photo_url,picture,profile_photo_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;
  if (row.profile_photo_status === "rejected") {
    return {
      name: buildDisplayName(row.display_name, row.first_name, row.last_name, row.name),
      first_name: parseNameParts(row.name, row.first_name, row.last_name).firstName || "Driver",
      profile_photo_url: null,
      thumbnail_photo_url: null,
      rating: 4.9,
    };
  }
  const photo = row.profile_photo_url
    ? publicStorageUrl("profile-images", row.profile_photo_url)
    : row.picture || null;
  const thumb = row.thumbnail_photo_url
    ? publicStorageUrl("profile-images", row.thumbnail_photo_url)
    : photo;
  const { firstName } = parseNameParts(row.name, row.first_name, row.last_name);
  return {
    name: buildDisplayName(row.display_name, row.first_name, row.last_name, row.name),
    first_name: firstName || "Driver",
    profile_photo_url: photo,
    thumbnail_photo_url: thumb,
    rating: 4.9,
  };
}
