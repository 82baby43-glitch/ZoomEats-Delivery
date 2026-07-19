// Stripe webhook — verify signature, process idempotently, update orders + payments.
import Stripe from "npm:stripe@16.11.0";
import { getServiceDb, isEventProcessed, markEventProcessed } from "../_shared/stripeIdempotency.ts";
import { fulfillPaidOrder } from "../_shared/fulfillPaidOrder.ts";
import { getStripeApiKey, getStripeWebhookSecret } from "../_shared/stripeEnv.ts";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
]);

function safeStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaUserId(meta: Stripe.Metadata | null | undefined): string | null {
  return safeStr(meta?.user_id) ?? safeStr(meta?.customer_id);
}

async function resolveOrderId(
  db: ReturnType<typeof getServiceDb>,
  opts: { orderId?: string | null; sessionId?: string | null }
): Promise<string | null> {
  if (opts.orderId) return opts.orderId;
  if (!opts.sessionId) return null;

  const { data: tx } = await db
    .from("payment_transactions")
    .select("order_id")
    .eq("session_id", opts.sessionId)
    .maybeSingle();

  const fromTx = safeStr(tx?.order_id);
  if (fromTx) return fromTx;

  const { data: order } = await db
    .from("orders")
    .select("order_id")
    .eq("stripe_session_id", opts.sessionId)
    .maybeSingle();

  return safeStr(order?.order_id);
}

async function syncPaymentsRow(
  db: ReturnType<typeof getServiceDb>,
  row: {
    orderId: string;
    customerId?: string | null;
    status: string;
    stripeCheckoutSession?: string | null;
    stripePaymentIntent?: string | null;
    amountPaid?: number | null;
    currency?: string | null;
    failureReason?: string | null;
  }
) {
  const patch: Record<string, unknown> = {
    order_id: row.orderId,
    customer_id: row.customerId ?? null,
    status: row.status,
    updated_at: new Date().toISOString(),
    webhook_processed_at: new Date().toISOString(),
  };
  if (row.stripeCheckoutSession) patch.stripe_checkout_session = row.stripeCheckoutSession;
  if (row.stripePaymentIntent) patch.stripe_payment_intent = row.stripePaymentIntent;
  if (row.amountPaid != null) patch.amount_paid = row.amountPaid;
  if (row.currency) patch.currency = row.currency;
  if (row.failureReason) patch.payment_failure_reason = row.failureReason;

  const conflict = row.stripePaymentIntent
    ? "stripe_payment_intent"
    : row.stripeCheckoutSession
      ? "stripe_checkout_session"
      : undefined;

  if (conflict) {
    await db.from("payments").upsert(patch, { onConflict: conflict });
  } else {
    await db.from("payments").insert(patch);
  }
}

async function markOrderPaid(
  db: ReturnType<typeof getServiceDb>,
  opts: {
    orderId: string;
    customerId?: string | null;
    sessionId?: string | null;
    paymentIntentId?: string | null;
    amountPaid?: number | null;
    currency?: string | null;
  }
) {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status, customer_id")
    .eq("order_id", opts.orderId)
    .maybeSingle();

  if (!existing) {
    console.log(JSON.stringify({ skipped: "order_not_found", order_id: opts.orderId }));
    return;
  }

  const result = await fulfillPaidOrder(db, {
    orderId: opts.orderId,
    sessionId: opts.sessionId,
    paymentIntentId: opts.paymentIntentId,
    amountPaid: opts.amountPaid,
    currency: opts.currency,
  });

  if (!result.updated && !result.alreadyFulfilled) return;

  const sessionId = safeStr(opts.sessionId);
  const paymentIntentId = safeStr(opts.paymentIntentId);

  await syncPaymentsRow(db, {
    orderId: opts.orderId,
    customerId: opts.customerId ?? safeStr(existing.customer_id),
    status: "paid",
    stripeCheckoutSession: sessionId,
    stripePaymentIntent: paymentIntentId,
    amountPaid: opts.amountPaid ?? null,
    currency: opts.currency ?? null,
  });

  console.log(JSON.stringify({ updated: result.updated, order_id: opts.orderId, session_id: sessionId }));
}

async function markOrderFailed(
  db: ReturnType<typeof getServiceDb>,
  opts: { orderId: string; customerId?: string | null; paymentIntentId?: string | null; reason?: string | null }
) {
  const { data: existing } = await db
    .from("orders")
    .select("order_id, payment_status, customer_id")
    .eq("order_id", opts.orderId)
    .maybeSingle();

  if (!existing || existing.payment_status === "paid") return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    payment_status: "failed",
    updated_at: now,
    webhook_processed_at: now,
  };
  if (opts.reason) patch.payment_failure_reason = opts.reason;
  if (opts.paymentIntentId) patch.stripe_payment_intent_id = opts.paymentIntentId;

  await db.from("orders").update(patch).eq("order_id", opts.orderId).neq("payment_status", "paid");

  await syncPaymentsRow(db, {
    orderId: opts.orderId,
    customerId: opts.customerId ?? safeStr(existing.customer_id),
    status: "payment_failed",
    stripePaymentIntent: opts.paymentIntentId ?? null,
    failureReason: opts.reason ?? null,
  });
}

async function processEvent(db: ReturnType<typeof getServiceDb>, event: Stripe.Event) {
  if (!HANDLED_EVENTS.has(event.type)) {
    console.log(JSON.stringify({ event_type: event.type, skipped: "ignored" }));
    return { order_id: null as string | null, session_id: null as string | null, payment_intent_id: null as string | null };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return { order_id: null, session_id: session.id, payment_intent_id: null };
    }

    const orderId = await resolveOrderId(db, {
      orderId: safeStr(session.metadata?.order_id),
      sessionId: session.id,
    });
    const customerId = metaUserId(session.metadata);
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    if (!orderId) {
      console.log(JSON.stringify({ event_type: event.type, error: "missing_order_id", session_id: session.id }));
      return { order_id: null, session_id: session.id, payment_intent_id: paymentIntentId };
    }

    await markOrderPaid(db, {
      orderId,
      customerId,
      sessionId: session.id,
      paymentIntentId,
      amountPaid: session.amount_total != null ? session.amount_total / 100 : null,
      currency: session.currency ?? null,
    });

    return { order_id: orderId, session_id: session.id, payment_intent_id: paymentIntentId };
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = await resolveOrderId(db, {
      orderId: safeStr(pi.metadata?.order_id),
      sessionId: safeStr(pi.metadata?.session_id),
    });
    const customerId = metaUserId(pi.metadata);

    if (!orderId) {
      return { order_id: null, session_id: null, payment_intent_id: pi.id };
    }

    await markOrderPaid(db, {
      orderId,
      customerId,
      sessionId: safeStr(pi.metadata?.session_id),
      paymentIntentId: pi.id,
      amountPaid: typeof pi.amount === "number" ? pi.amount / 100 : null,
      currency: pi.currency ?? null,
    });

    return { order_id: orderId, session_id: safeStr(pi.metadata?.session_id), payment_intent_id: pi.id };
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = await resolveOrderId(db, {
      orderId: safeStr(pi.metadata?.order_id),
      sessionId: safeStr(pi.metadata?.session_id),
    });
    const customerId = metaUserId(pi.metadata);
    const reason = pi.last_payment_error?.message ?? "payment_failed";

    if (!orderId) {
      return { order_id: null, session_id: null, payment_intent_id: pi.id };
    }

    await markOrderFailed(db, {
      orderId,
      customerId,
      paymentIntentId: pi.id,
      reason,
    });

    return { order_id: orderId, session_id: safeStr(pi.metadata?.session_id), payment_intent_id: pi.id };
  }

  return { order_id: null, session_id: null, payment_intent_id: null };
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const stripeKey = getStripeApiKey();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripeKey || !webhookSecret) {
    console.error(JSON.stringify({ error: "webhook_not_configured" }));
    return new Response("OK", { status: 200 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "missing_stripe_signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload = "";
  try {
    payload = await req.text();
  } catch (e) {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : "read_body_failed" }));
    return new Response("OK", { status: 200 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid_signature";
    console.error(JSON.stringify({ error: message }));
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getServiceDb();

  try {
    if (await isEventProcessed(db, event.id)) {
      console.log(JSON.stringify({ event_type: event.type, skipped: "duplicate_event_id" }));
      return new Response("OK", { status: 200 });
    }

    const result = await processEvent(db, event);

    await markEventProcessed(db, {
      event_id: event.id,
      type: event.type,
      order_id: result.order_id,
      session_id: result.session_id,
      payment_intent_id: result.payment_intent_id,
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
