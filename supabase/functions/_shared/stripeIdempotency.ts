import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export async function isEventProcessed(db: SupabaseClient, eventId: string): Promise<boolean> {
  const { data } = await db.from("stripe_event_log").select("event_id").eq("event_id", eventId).maybeSingle();
  return !!data;
}

export async function markEventProcessed(
  db: SupabaseClient,
  row: { event_id: string; type: string; session_id?: string | null; payment_intent_id?: string | null }
) {
  await db.from("stripe_event_log").upsert(
    {
      event_id: row.event_id,
      type: row.type,
      event_type: row.type,
      session_id: row.session_id ?? null,
      stripe_session_id: row.session_id ?? null,
      payment_intent_id: row.payment_intent_id ?? null,
      status: "processed",
      processed_at: new Date().toISOString(),
    },
    { onConflict: "event_id", ignoreDuplicates: true }
  );
}

export function getServiceDb() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceKey);
}
