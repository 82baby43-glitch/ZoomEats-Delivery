import type { SupabaseClient } from "@supabase/supabase-js";

export const LOG_EVENTS = {
  CHECKOUT_STARTED: "CHECKOUT_STARTED",
  STRIPE_SESSION_CREATED: "STRIPE_SESSION_CREATED",
  RATE_LIMIT_HIT: "RATE_LIMIT_HIT",
} as const;

type LogEvent = (typeof LOG_EVENTS)[keyof typeof LOG_EVENTS];

const MEMORY_TTL_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [1000, 2000, 5000];
const memoryProcessed = new Map<string, number>();

export function structuredLog(event: LogEvent, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...meta }));
}

function pruneMemory(key: string) {
  const ts = memoryProcessed.get(key);
  if (ts && Date.now() - ts > MEMORY_TTL_MS) memoryProcessed.delete(key);
}

function memoryMarkProcessed(key: string) {
  memoryProcessed.set(key, Date.now());
}

function memoryAlreadyProcessed(key: string): boolean {
  pruneMemory(key);
  return memoryProcessed.has(key);
}

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

  const { data: order } = await db
    .from("orders")
    .select("payment_status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (order?.payment_status === "paid") {
    memoryMarkProcessed(`sess:${sessionId}`);
    return true;
  }

  return false;
}

export async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  meta?: Record<string, unknown>
): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;

    structuredLog(LOG_EVENTS.RATE_LIMIT_HIT, { url, attempt: attempt + 1, ...meta });
    if (attempt >= RETRY_DELAYS_MS.length) return res;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  throw new Error("fetchWithRateLimitRetry exhausted");
}
