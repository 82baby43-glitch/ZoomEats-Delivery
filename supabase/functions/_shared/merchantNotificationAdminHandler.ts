import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logSystemEvent } from "./systemEvents.ts";

type HandlerCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

export async function handleMerchantNotificationAdminRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  if (path === "/admin/merchant-notifications/status" && method === "GET") {
    ctx.requireRole("admin");
    const { data: events } = await db
      .from("system_events")
      .select("*")
      .or("source.eq.merchant_notifications,metadata->>kind.eq.merchant_notification_test,metadata->>kind.eq.merchant_notification_failure")
      .order("created_at", { ascending: false })
      .limit(25);
    return {
      events: events || [],
      delivery_ok: !(events || []).some((e) => e.metadata?.kind === "merchant_notification_failure"),
    };
  }

  if (path === "/admin/merchant-notifications/test-sound" && method === "POST") {
    const u = ctx.requireRole("admin");
    const environment = String(body.environment || "sandbox");
    await logSystemEvent(db, {
      event_type: "admin_test",
      severity: "info",
      source: "merchant_notifications",
      message: `Admin tested merchant notification sound (${environment})`,
      metadata: {
        admin_id: u.user_id,
        environment,
        merchant_category: body.merchant_category || "all",
        kind: "merchant_notification_test",
      },
    });
    return { ok: true, message: "Test logged. Play sound from merchant dashboard or simulator." };
  }

  if (path === "/admin/merchant-notifications/log-failure" && method === "POST") {
    ctx.requireRole("admin", "vendor", "restaurant_owner", "restaurant_staff");
    await logSystemEvent(db, {
      event_type: "merchant_notification_failure",
      severity: "warn",
      source: "merchant_notifications",
      message: String(body.message || "Merchant notification delivery failed"),
      metadata: {
        kind: "merchant_notification_failure",
        merchant_id: body.merchant_id,
        order_id: body.order_id,
        channel: body.channel || "unknown",
        environment: body.environment || "production",
      },
    });
    return { ok: true };
  }

  return null;
}
