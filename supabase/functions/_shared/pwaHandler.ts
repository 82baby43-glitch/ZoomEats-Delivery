import type { SupabaseClient } from "@supabase/supabase-js";
import { canUserAccessAppType } from "./pwaRoleAccess.ts";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function getVapidPublicKey() {
  return Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") || Deno.env.get("VAPID_PUBLIC_KEY") || "";
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
    return { publicKey: getVapidPublicKey() };
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

  return null;
}
