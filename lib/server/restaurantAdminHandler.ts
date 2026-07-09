import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateRestaurantReadiness,
  launchStatusLabel,
  syncRestaurantLaunchState,
} from "../restaurant/readiness";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type AdminCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

export async function approveRestaurantWithReadiness(
  db: SupabaseClient,
  admin: Record<string, unknown>,
  restaurantId: string
) {
  const { data: rest } = await db
    .from("restaurants")
    .select("owner_id,name")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!rest) throwErr("Restaurant not found", 404);

  const readiness = await evaluateRestaurantReadiness(db, restaurantId);

  await db.from("restaurants").update({
    approved: true,
    approval_status: "approved",
    active: true,
    launch_status: readiness?.launch_status || "pending_menu",
    accepting_orders: readiness?.can_go_live ?? false,
    updated_at: new Date().toISOString(),
  }).eq("restaurant_id", restaurantId);

  if (rest?.owner_id) {
    await db.from("users").update({ approval_status: "approved", active: true }).eq("user_id", rest.owner_id);
    await db.from("compliance_reviews").update({
      status: "approved",
      approval_status: "approved",
      reviewed_by: admin.user_id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", rest.owner_id).in("status", ["pending"]);
  }

  const updated = await evaluateRestaurantReadiness(db, restaurantId);

  return {
    ok: true,
    restaurant_id: restaurantId,
    launch_status: updated?.launch_status,
    launch_status_label: updated ? launchStatusLabel(updated.launch_status) : null,
    accepting_orders: updated?.accepting_orders ?? false,
    can_go_live: updated?.can_go_live ?? false,
    blockers: updated?.blockers ?? [],
    checks: updated?.checks ?? [],
    message: updated?.can_go_live
      ? "Restaurant approved and is live for orders."
      : "Restaurant approved but cannot accept orders until blockers are resolved.",
  };
}

export async function handleRestaurantAdminRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, body = {} } = ctx;

  const readinessMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/readiness$/);
  if (readinessMatch && method === "GET") {
    ctx.requireRole("admin");
    const readiness = await evaluateRestaurantReadiness(db, readinessMatch[1]);
    if (!readiness) throwErr("Restaurant not found", 404);
    return {
      ...readiness,
      launch_status_label: launchStatusLabel(readiness.launch_status),
    };
  }

  const locationMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/location$/);
  if (locationMatch && method === "POST") {
    ctx.requireRole("admin");
    const restaurantId = locationMatch[1];
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throwErr("Valid latitude and longitude required");
    }

    const patch: Record<string, unknown> = {
      latitude: lat,
      longitude: lng,
      address_validated: true,
      updated_at: new Date().toISOString(),
    };
    if (body.address) patch.address = String(body.address);
    if (body.city) patch.city = String(body.city);
    if (body.state) patch.state = String(body.state);
    if (body.zip_code) patch.zip_code = String(body.zip_code);

    await db.from("restaurants").update(patch).eq("restaurant_id", restaurantId);
    const readiness = await syncRestaurantLaunchState(db, restaurantId);
    return { ok: true, readiness: readiness ? { ...readiness, launch_status_label: launchStatusLabel(readiness.launch_status) } : null };
  }

  const activateMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/activate$/);
  if (activateMatch && method === "POST") {
    ctx.requireRole("admin");
    const readiness = await syncRestaurantLaunchState(db, activateMatch[1]);
    if (!readiness) throwErr("Restaurant not found", 404);
    if (!readiness.can_go_live) {
      throwErr(`Cannot activate: ${readiness.blockers.join(", ")}`, 400);
    }
    return { ok: true, accepting_orders: true, launch_status: readiness.launch_status };
  }

  return null;
}
