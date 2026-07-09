import type { SupabaseClient } from "@supabase/supabase-js";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export type SystemEventType =
  | "payment_failed"
  | "delivery_failed"
  | "api_error"
  | "driver_disconnect"
  | "restaurant_error"
  | "database_error"
  | "rate_limit_blocked"
  | "simulation_complete";

export async function logSystemEvent(
  db: SupabaseClient,
  entry: {
    event_type: SystemEventType;
    severity?: "info" | "warn" | "error";
    source?: string;
    message: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await db.from("system_events").insert({
      event_id: uid("evt"),
      event_type: entry.event_type,
      severity: entry.severity || "info",
      source: entry.source || null,
      message: entry.message,
      metadata: entry.metadata || {},
    });
  } catch {
    // Table may not exist on older deployments — never break API flow
  }
}

export async function fetchSystemEvents(db: SupabaseClient, limit = 100) {
  const { data, error } = await db
    .from("system_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { events: [], error: error.message };
  return { events: data || [] };
}
