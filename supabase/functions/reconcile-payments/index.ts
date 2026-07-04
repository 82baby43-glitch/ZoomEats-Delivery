// Reconciliation disabled during Stripe rollback — webhook updates orders directly.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const auth = req.headers.get("authorization") || "";
  const cronSecret = Deno.env.get("RECONCILE_CRON_SECRET") || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true, skipped: true, reason: "reconciliation_disabled" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
