import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { canUserAccessAppType } from "../pwa/roleAccess";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function getVapidKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:support@zoomeats.com";
  return { publicKey, privateKey, subject };
}

export async function handlePwaRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    user: Record<string, unknown> | null;
    requireAuth: () => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body = {} } = opts;
  const requireAuth = opts.requireAuth;

  if (path === "/pwa/vapid-public-key" && method === "GET") {
    const { publicKey } = getVapidKeys();
    return { publicKey };
  }

  if (path === "/pwa/installation" && method === "POST") {
    const u = requireAuth();
    const userId = String(u.user_id);
    const appType = String(body.app_type || "customer");
    if (!["customer", "driver", "restaurant", "admin"].includes(appType)) throwErr("Invalid app_type");
    if (!canUserAccessAppType(u, appType)) throwErr("This account cannot install that app", 403);
    const deviceId = String(body.device_id || "unknown");
    const row = {
      installation_id: uid("pwa"),
      user_id: userId,
      app_type: appType,
      installation_status: String(body.installation_status || "installed"),
      platform: body.platform || null,
      device_id: deviceId,
      user_agent: body.user_agent || null,
      updated_at: new Date().toISOString(),
    };
    await db.from("pwa_installations").upsert(row, { onConflict: "user_id,app_type,device_id" });
    return { ok: true };
  }

  if (path === "/pwa/push/subscribe" && method === "POST") {
    const u = requireAuth();
    const userId = String(u.user_id);
    const sub = body.subscription as Record<string, unknown> | undefined;
    if (!sub?.endpoint) throwErr("Missing subscription");
    const keys = sub.keys as Record<string, string> | undefined;
    const appType = String(body.app_type || "customer");
    if (!canUserAccessAppType(u, appType)) throwErr("This account cannot use that app", 403);
    await db.from("push_subscriptions").upsert({
      subscription_id: uid("psub"),
      user_id: userId,
      app_type: appType,
      endpoint: String(sub.endpoint),
      p256dh: String(keys?.p256dh || ""),
      auth: String(keys?.auth || ""),
      device_id: body.device_id || null,
      user_agent: body.user_agent || null,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    return { ok: true };
  }

  if (path === "/pwa/push/unsubscribe" && method === "POST") {
    const u = requireAuth();
    const endpoint = String(body.endpoint || "");
    if (!endpoint) throwErr("Missing endpoint");
    await db.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() })
      .eq("user_id", u.user_id).eq("endpoint", endpoint);
    return { ok: true };
  }

  if (path === "/pwa/push/send" && method === "POST") {
    const u = requireAuth();
    if (String(u.role) !== "admin") throwErr("Admin only", 403);
    const targetUserId = String(body.user_id || "");
    const title = String(body.title || "ZoomEats");
    const msgBody = String(body.body || "");
    const url = String(body.url || "/");
    if (!targetUserId) throwErr("user_id required");
    const sent = await sendPushToUser(db, targetUserId, { title, body: msgBody, url, tag: body.tag as string });
    return { ok: true, sent };
  }

  return null;
}

export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string; app_type?: string }
) {
  const { publicKey, privateKey, subject } = getVapidKeys();
  if (!publicKey || !privateKey) return 0;

  webpush.setVapidDetails(subject, publicKey, privateKey);

  let query = db.from("push_subscriptions").select("*").eq("user_id", userId).eq("active", true);
  if (payload.app_type) query = query.eq("app_type", payload.app_type);
  const { data: subs } = await query;

  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url || "/",
          tag: payload.tag || "zoomeats",
        })
      );
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await db.from("push_subscriptions").update({ active: false }).eq("subscription_id", sub.subscription_id);
      }
    }
  }
  return sent;
}
