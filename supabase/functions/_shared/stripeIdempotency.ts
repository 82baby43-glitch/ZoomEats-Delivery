import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Idempotency via production `payment_logs.stripe_event_id`. */
export async function isEventProcessed(db: SupabaseClient, eventId: string): Promise<boolean> {
  const { data } = await db
    .from("payment_logs")
    .select("id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return !!data;
}

export async function markEventProcessed(
  db: SupabaseClient,
  row: {
    event_id: string;
    type: string;
    order_id?: string | null;
    status?: string | null;
    session_id?: string | null;
    payment_intent_id?: string | null;
    error_message?: string | null;
  }
) {
  await db.from("payment_logs").insert({
    order_id: row.order_id ?? null,
    payment_id: null,
    event_type: row.type,
    status: row.status ?? "processed",
    error_message: row.error_message ?? null,
    stripe_event_id: row.event_id,
    processed_at: new Date().toISOString(),
    metadata: {
      session_id: row.session_id ?? null,
      payment_intent_id: row.payment_intent_id ?? null,
    },
  });
}

export function getServiceDb() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceKey);
}
