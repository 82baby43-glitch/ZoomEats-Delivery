import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseDriverApis } from "../founderDriver/auth";
import {
  acceptDriverOffer,
  declineDriverOffer,
  expireDriverOffer,
  getActiveOfferForDriver,
  getOfferStatsForAdmin,
  lockOfferToDevice,
} from "./offers";
import type { RealtimeRuntime } from "../logistics/delivery-realtime";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

export async function handleDriverOfferRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body: Record<string, unknown>;
    params: Record<string, string>;
    requireAuth: () => Record<string, unknown>;
    requireRole: (...roles: string[]) => Record<string, unknown>;
    runtime?: RealtimeRuntime;
  }
): Promise<unknown | null> {
  const { path, method, body, runtime } = opts;

  if (path === "/driver/offers/active" && method === "GET") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const deviceId = String(opts.params.device_id || body.device_id || "");
    const { data: d } = await db.from("drivers").select("driver_id").eq("user_id", u.user_id).maybeSingle();
    if (!d) return { offer: null };

    const offer = await getActiveOfferForDriver(db, d.driver_id);
    if (!offer || !deviceId) return { offer };

    const locked = await lockOfferToDevice(db, offer.offer_id, d.driver_id, deviceId);
    if (locked?.locked_device_id && locked.locked_device_id !== deviceId) {
      return { offer: null, locked_elsewhere: true };
    }

    return {
      offer: {
        ...locked,
        ttl_seconds: Math.max(0, Math.ceil((new Date(String(locked?.expires_at)).getTime() - Date.now()) / 1000)),
      },
    };
  }

  const acceptMatch = path.match(/^\/driver\/offers\/([^/]+)\/accept$/);
  if (acceptMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const deviceId = String(body.device_id || "");
    if (!deviceId) throwErr("device_id required");
    return acceptDriverOffer(db, acceptMatch[1], String(u.user_id), deviceId, runtime);
  }

  const declineMatch = path.match(/^\/driver\/offers\/([^/]+)\/decline$/);
  if (declineMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    return declineDriverOffer(db, declineMatch[1], String(u.user_id), runtime);
  }

  const expireMatch = path.match(/^\/driver\/offers\/([^/]+)\/expire$/);
  if (expireMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    return expireDriverOffer(db, expireMatch[1], String(u.user_id), runtime);
  }

  const statsMatch = path.match(/^\/admin\/orders\/([^/]+)\/offer-stats$/);
  if (statsMatch && method === "GET") {
    opts.requireRole("admin");
    return getOfferStatsForAdmin(db, statsMatch[1]);
  }

  if (path === "/admin/offer-stats" && method === "GET") {
    opts.requireRole("admin");
    return getOfferStatsForAdmin(db);
  }

  return null;
}
