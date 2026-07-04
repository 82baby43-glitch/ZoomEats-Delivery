// Stripe webhook — minimal, synchronous, production-safe
import { getServiceDb, isEventProcessed, markEventProcessed } from "../_shared/stripeIdempotency.ts";
import { getStripeWebhookSecret } from "../_shared/stripeEnv.ts";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
]);

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

function safeStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeMeta(obj: Record<string, unknown> | null | undefined): Record<string, string> {
  const meta = obj?.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return meta as Record<string, string>;
}

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<StripeEvent> {
  if (!sigHeader || !secret) throw new Error("Missing signature or secret");

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of sigHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid stripe-signature header");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = `${timestamp}.${payload}`;
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!signatures.some((sig) => sig === expected)) {
    throw new Error("Webhook signature mismatch");
  }

  const parsed = JSON.parse(payload) as StripeEvent;
  if (!parsed?.id || !parsed?.type || !parsed?.data?.object) {
    throw new Error("Invalid event payload");
  }
  return parsed;
}

async function resolveOrderId(
  db: ReturnType<typeof getServiceDb>,
  opts: { orderId?: string | null; sessionId?: string | null; metadata?: Record<string, string> }
): Promise<string | null> {
  const fromMeta = safeStr(opts.metadata?.order_id);
  if (fromMeta) return fromMeta;
  if (opts.orderId) return opts.orderId;
  if (!opts.sessionId) return null;

  const { data: tx } = await db
    .from("payment_transactions")
    .select("order_id")
    .eq("session_id", opts.sessionId)
    .maybeSingle();

  return safeStr(tx?.order_id) ?? null;
}

async function markOrderPaid(
  db: ReturnType<typeof getServiceDb>,
  opts: { orderId: string; sessionId?: string | null; paymentIntentId?: string | null }
) {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status")
    .eq("order_id", opts.orderId)
    .maybeSingle();

  if (!existing) {
    console.log(JSON.stringify({ skipped: "order_not_found", order_id: opts.orderId }));
    return;
  }

  if (existing.payment_status === "paid") {
    console.log(JSON.stringify({ skipped: "already_paid", order_id: opts.orderId }));
    return;
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    payment_status: "paid",
    updated_at: now,
  };

  const sessionId = safeStr(opts.sessionId);
  const paymentIntentId = safeStr(opts.paymentIntentId);
  if (sessionId) patch.stripe_session_id = sessionId;
  if (paymentIntentId) patch.stripe_payment_intent_id = paymentIntentId;

  const { error: updateError } = await db
    .from("orders")
    .update(patch)
    .eq("order_id", opts.orderId)
    .neq("payment_status", "paid");

  if (updateError) {
    console.log(JSON.stringify({ error: updateError.message, order_id: opts.orderId }));
    return;
  }

  if (sessionId) {
    await db
      .from("payment_transactions")
      .update({ payment_status: "paid", status: "complete" })
      .eq("session_id", sessionId)
      .neq("payment_status", "paid");
  }

  console.log(JSON.stringify({ updated: true, order_id: opts.orderId, session_id: sessionId, payment_intent_id: paymentIntentId }));
}

async function markOrderFailed(db: ReturnType<typeof getServiceDb>, orderId: string) {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!existing || existing.payment_status === "paid") return;

  const now = new Date().toISOString();
  await db
    .from("orders")
    .update({
      payment_status: "failed",
      updated_at: now,
    })
    .eq("order_id", orderId)
    .neq("payment_status", "paid");

  console.log(JSON.stringify({ failed: true, order_id: orderId }));
}

async function processEvent(db: ReturnType<typeof getServiceDb>, event: StripeEvent) {
  const obj = event.data?.object;
  if (!obj || typeof obj !== "object") return;

  const meta = safeMeta(obj);
  const sessionId = event.type.startsWith("checkout.session.")
    ? safeStr(obj.id)
    : safeStr(meta.session_id);
  const paymentIntentId =
    safeStr(obj.payment_intent) ?? (event.type.startsWith("payment_intent.") ? safeStr(obj.id) : null);

  console.log(
    JSON.stringify({
      event_type: event.type,
      order_id: meta.order_id ?? null,
      session_id: sessionId,
      payment_intent_id: paymentIntentId,
    })
  );

  if (!HANDLED_EVENTS.has(event.type)) {
    console.log(JSON.stringify({ event_type: event.type, skipped: "ignored" }));
    return;
  }

  if (event.type === "checkout.session.completed") {
    if (obj.payment_status !== "paid") return;
    const orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: safeStr(obj.id), metadata: meta });
    if (!orderId) return;
    await markOrderPaid(db, {
      orderId,
      sessionId: safeStr(obj.id),
      paymentIntentId: safeStr(obj.payment_intent),
    });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: meta.session_id, metadata: meta });
    if (!orderId) return;
    await markOrderPaid(db, {
      orderId,
      sessionId: meta.session_id ?? null,
      paymentIntentId: safeStr(obj.id),
    });
    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    const orderId = await resolveOrderId(db, { orderId: meta.order_id, sessionId: meta.session_id, metadata: meta });
    if (!orderId) return;
    await markOrderFailed(db, orderId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.error(JSON.stringify({ error: "webhook_not_configured" }));
    return new Response("OK", { status: 200 });
  }

  let payload = "";
  try {
    payload = await req.text();
  } catch (e) {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : "read_body_failed" }));
    return new Response("OK", { status: 200 });
  }

  const sigHeader = req.headers.get("stripe-signature") ?? "";

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(payload, sigHeader, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid_signature";
    console.error(JSON.stringify({ error: message }));
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }

  const db = getServiceDb();

  try {
    if (await isEventProcessed(db, event.id)) {
      console.log(JSON.stringify({ event_type: event.type, skipped: "duplicate_event_id" }));
      return new Response("OK", { status: 200 });
    }

    await processEvent(db, event);

    const sessionId = event.type.startsWith("checkout.session.")
      ? safeStr(event.data?.object?.id)
      : safeStr(safeMeta(event.data?.object).session_id);
    const paymentIntentId =
      safeStr(event.data?.object?.payment_intent) ??
      (event.type.startsWith("payment_intent.") ? safeStr(event.data?.object?.id) : null);

    await markEventProcessed(db, {
      event_id: event.id,
      type: event.type,
      session_id: sessionId,
      payment_intent_id: paymentIntentId,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        event_id: event?.id ?? null,
        event_type: event?.type ?? null,
      })
    );
  }

  return new Response("OK", { status: 200 });
});
