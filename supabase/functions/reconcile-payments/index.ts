// Scheduled reconciliation: Stripe ↔ Supabase payment state
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const PaymentStatus = { PAID: "paid" } as const;

async function confirmPayment(
  db: ReturnType<typeof createClient>,
  opts: { orderId: string; sessionId: string; paymentIntentId?: string }
) {
  const now = new Date().toISOString();
  const { data: updated } = await db
    .from("orders")
    .update({
      payment_status: PaymentStatus.PAID,
      order_status: "confirmed",
      status: "placed",
      confirmed_at: now,
    })
    .eq("order_id", opts.orderId)
    .neq("payment_status", PaymentStatus.PAID)
    .select("order_id")
    .maybeSingle();

  if (!updated) return false;

  await db.from("payment_transactions").update({ payment_status: PaymentStatus.PAID, status: "complete" }).eq("session_id", opts.sessionId);
  await db.from("stripe_checkout_sessions").update({ status: "complete", updated_at: now }).eq("session_id", opts.sessionId);
  await db.from("payment_audit_log").insert({
    order_id: opts.orderId,
    action: "paid",
    source: "reconciliation",
    meta: { session_id: opts.sessionId, payment_intent_id: opts.paymentIntentId },
  });
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const auth = req.headers.get("authorization") || "";
  const cronSecret = Deno.env.get("RECONCILE_CRON_SECRET") || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const stripeKey = Deno.env.get("STRIPE_API_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

  if (!stripeKey) {
    return new Response(JSON.stringify({ skipped: true, reason: "no_stripe_key" }), { status: 200 });
  }

  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions?limit=50&created[gte]=${since}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const payload = await stripeRes.json();
  const sessions = (payload.data as Array<Record<string, unknown>>) ?? [];

  let checked = 0;
  let fixed = 0;
  let flagged = 0;

  for (const session of sessions) {
    checked += 1;
    const sessionId = session.id as string;
    if (session.payment_status !== "paid") continue;

    const metadata = session.metadata as Record<string, string> | undefined;
    let orderId = metadata?.order_id;
    if (!orderId) {
      const { data: tx } = await db.from("payment_transactions").select("order_id, payment_status").eq("session_id", sessionId).maybeSingle();
      orderId = tx?.order_id;
    }
    if (!orderId) continue;

    const { data: order } = await db.from("orders").select("payment_status").eq("order_id", orderId).maybeSingle();
    if (!order) continue;

    if (order.payment_status !== "paid") {
      const ok = await confirmPayment(db, { orderId, sessionId, paymentIntentId: session.payment_intent as string });
      if (ok) fixed += 1;
    }
  }

  const { data: orphanPaid } = await db
    .from("orders")
    .select("order_id, stripe_session_id")
    .eq("payment_status", "paid")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  for (const row of orphanPaid ?? []) {
    if (!row.stripe_session_id) continue;
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${row.stripe_session_id}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!r.ok) continue;
    const s = await r.json();
    if (s.payment_status !== "paid") {
      flagged += 1;
      await db.from("payment_error_logs").insert({
        order_id: row.order_id,
        session_id: row.stripe_session_id,
        error_message: "Supabase paid but Stripe session not paid",
        source: "reconciliation",
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, checked, fixed, flagged }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
