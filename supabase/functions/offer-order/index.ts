// Supabase Edge Function: offer-order
// Triggered when restaurant accepts a paid order — sends timed driver offer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createAndBroadcastOffer } from "../_shared/dispatch/offers.ts";
import { verifyInternalCall } from "../_shared/internalAuth.ts";

Deno.serve(async (req) => {
  const authDenied = verifyInternalCall(req);
  if (authDenied) return authDenied;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const orderId = body.order_id;
  if (!orderId) {
    return new Response(JSON.stringify({ error: "order_id_required" }), { status: 400 });
  }

  try {
    const result = await createAndBroadcastOffer(db, orderId, { supabaseUrl, serviceKey });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(JSON.stringify({ offer_order_failed: String(e), order_id: orderId }));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
