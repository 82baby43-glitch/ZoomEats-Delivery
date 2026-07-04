import type { SupabaseClient } from "@supabase/supabase-js";

export const LOG_EVENTS = {
  CHECKOUT_STARTED: "CHECKOUT_STARTED",
  STRIPE_SESSION_CREATED: "STRIPE_SESSION_CREATED",
  WEBHOOK_RECEIVED: "WEBHOOK_RECEIVED",
  WEBHOOK_PROCESSED: "WEBHOOK_PROCESSED",
  ORDER_UPDATED: "ORDER_UPDATED",
  DISPATCH_TRIGGERED: "DISPATCH_TRIGGERED",
  RATE_LIMIT_HIT: "RATE_LIMIT_HIT",
} as const;

type LogEvent = (typeof LOG_EVENTS)[keyof typeof LOG_EVENTS];

const MEMORY_TTL_MS = 5 * 60 * 1000;
const memoryProcessed = new Map<string, number>();

export function structuredLog(event: LogEvent, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...meta }));
}

function pruneMemory(key: string) {
  const ts = memoryProcessed.get(key);
  if (ts && Date.now() - ts > MEMORY_TTL_MS) memoryProcessed.delete(key);
}

export function memoryMarkProcessed(key: string) {
  memoryProcessed.set(key, Date.now());
}

export function memoryAlreadyProcessed(key: string): boolean {
  pruneMemory(key);
  return memoryProcessed.has(key);
}

export async function dbEventExists(db: SupabaseClient, eventId: string): Promise<boolean> {
  const { data } = await db.from("stripe_event_log").select("event_id").eq("event_id", eventId).maybeSingle();
  return !!data;
}

export async function logStripeEvent(
  db: SupabaseClient,
  row: { event_id: string; type: string; session_id?: string | null; payment_intent_id?: string | null; status?: string }
) {
  await db.from("stripe_event_log").upsert(
    {
      event_id: row.event_id,
      type: row.type,
      event_type: row.type,
      session_id: row.session_id ?? null,
      stripe_session_id: row.session_id ?? null,
      payment_intent_id: row.payment_intent_id ?? null,
      status: row.status ?? "processed",
      processed_at: new Date().toISOString(),
    },
    { onConflict: "event_id", ignoreDuplicates: true }
  );
}

export async function claimStripeEvent(
  db: SupabaseClient,
  row: { event_id: string; type: string; session_id?: string | null }
): Promise<"claimed" | "duplicate"> {
  if (memoryAlreadyProcessed(`evt:${row.event_id}`)) return "duplicate";
  const exists = await dbEventExists(db, row.event_id);
  if (exists) {
    memoryMarkProcessed(`evt:${row.event_id}`);
    return "duplicate";
  }
  const { error } = await db.from("stripe_event_log").insert({
    event_id: row.event_id,
    type: row.type,
    event_type: row.type,
    session_id: row.session_id ?? null,
    stripe_session_id: row.session_id ?? null,
    status: "processing",
    processed_at: new Date().toISOString(),
  });
  if (error) {
    memoryMarkProcessed(`evt:${row.event_id}`);
    return "duplicate";
  }
  memoryMarkProcessed(`evt:${row.event_id}`);
  return "claimed";
}

export async function alreadyProcessedSession(db: SupabaseClient, sessionId: string): Promise<boolean> {
  if (memoryAlreadyProcessed(`sess:${sessionId}`)) return true;
  const { data: tx } = await db
    .from("payment_transactions")
    .select("payment_status")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (tx?.payment_status === "paid") {
    memoryMarkProcessed(`sess:${sessionId}`);
    return true;
  }
  const { data: logged } = await db
    .from("stripe_event_log")
    .select("event_id")
    .eq("session_id", sessionId)
    .eq("status", "processed")
    .limit(1)
    .maybeSingle();
  if (logged) {
    memoryMarkProcessed(`sess:${sessionId}`);
    return true;
  }
  return false;
}

const RETRY_DELAYS_MS = [1000, 2000, 5000];

export async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  db?: SupabaseClient
): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;

    structuredLog(LOG_EVENTS.RATE_LIMIT_HIT, { url, attempt: attempt + 1 });
    if (db) {
      await logStripeEvent(db, {
        event_id: `rate_${Date.now()}_${attempt}`,
        type: LOG_EVENTS.RATE_LIMIT_HIT,
        status: "RATE_LIMITED",
      });
    }
    if (attempt >= RETRY_DELAYS_MS.length) return res;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  throw new Error("fetchWithRateLimitRetry exhausted");
}
