import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseDriverApis } from "./founderDriverAuth.ts";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

async function resolveDriverId(db: SupabaseClient, userId: string) {
  const { data } = await db.from("drivers").select("driver_id").eq("user_id", userId).maybeSingle();
  return data?.driver_id as string | undefined;
}

export async function handleLogisticsSafetyRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body: Record<string, unknown>;
    requireAuth: () => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body } = opts;
  if (!path.startsWith("/logistics/safety")) return null;

  const u = opts.requireAuth();
  if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
    throwErr("Delivery or founder driver access required", 403);
  }
  const userId = String(u.user_id);
  const driverId = await resolveDriverId(db, userId);

  if (path === "/logistics/safety/emergency" && method === "POST") {
    const eventId = uid("safety");
    const row = {
      event_id: eventId,
      user_id: userId,
      driver_id: driverId ?? null,
      event_type: "emergency",
      message: String(body.message || "Driver emergency alert"),
      latitude: body.latitude != null ? Number(body.latitude) : null,
      longitude: body.longitude != null ? Number(body.longitude) : null,
      order_id: body.order_id ? String(body.order_id) : null,
      status: "escalated",
      metadata: { source: "driver_live_map", priority: "critical" },
      updated_at: new Date().toISOString(),
    };
    await db.from("driver_safety_events").insert(row);
    await db.from("driver_safety_messages").insert({
      message_id: uid("msg"),
      event_id: eventId,
      sender_role: "system",
      body: "Emergency alert received. Support has been notified and will respond immediately.",
    });
    return { ok: true, event_id: eventId, status: "escalated" };
  }

  if (path === "/logistics/safety/support" && method === "POST") {
    const text = String(body.message || body.text || "").trim();
    if (!text) throwErr("Message required", 400);

    let eventId = body.event_id ? String(body.event_id) : null;
    if (!eventId) {
      const { data: open } = await db
        .from("driver_safety_events")
        .select("event_id")
        .eq("user_id", userId)
        .eq("event_type", "support_chat")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      eventId = open?.event_id ?? uid("safety");
      if (!open) {
        await db.from("driver_safety_events").insert({
          event_id: eventId,
          user_id: userId,
          driver_id: driverId ?? null,
          event_type: "support_chat",
          message: text.slice(0, 240),
          latitude: body.latitude != null ? Number(body.latitude) : null,
          longitude: body.longitude != null ? Number(body.longitude) : null,
          order_id: body.order_id ? String(body.order_id) : null,
          status: "open",
          metadata: { source: "driver_live_map" },
          updated_at: new Date().toISOString(),
        });
      }
    }

    const messageId = uid("msg");
    await db.from("driver_safety_messages").insert({
      message_id: messageId,
      event_id: eventId,
      sender_role: "driver",
      body: text,
    });
    await db.from("driver_safety_events").update({ updated_at: new Date().toISOString() }).eq("event_id", eventId);

    const { data: messages } = await db
      .from("driver_safety_messages")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    return {
      ok: true,
      event_id: eventId,
      messages: messages || [],
      reply: "Thanks — a support agent will reply in this thread shortly.",
    };
  }

  if (path === "/logistics/safety/support" && method === "GET") {
    const { data: open } = await db
      .from("driver_safety_events")
      .select("event_id,status,created_at")
      .eq("user_id", userId)
      .eq("event_type", "support_chat")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!open) return { event_id: null, messages: [] };

    const { data: messages } = await db
      .from("driver_safety_messages")
      .select("*")
      .eq("event_id", open.event_id)
      .order("created_at", { ascending: true });

    return { event_id: open.event_id, status: open.status, messages: messages || [] };
  }

  throwErr("Safety route not found", 404);
}
