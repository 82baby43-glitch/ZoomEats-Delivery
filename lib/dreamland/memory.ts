import type { SupabaseClient } from "@supabase/supabase-js";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export type ShortTermMemory = {
  current_mood?: string | null;
  last_recommendation_ids?: string[];
  current_search?: string | null;
  updated_at?: string;
};

export async function getActiveSessionId(db: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await db
    .from("dreamland_profiles")
    .select("last_context")
    .eq("user_id", userId)
    .maybeSingle();
  const ctx = (profile?.last_context as { active_session_id?: string } | null) || {};
  return ctx.active_session_id || `dreamland_${userId}`;
}

export async function setActiveSessionId(db: SupabaseClient, userId: string, sessionId: string) {
  const { data: profile } = await db.from("dreamland_profiles").select("last_context").eq("user_id", userId).maybeSingle();
  const ctx = (profile?.last_context as Record<string, unknown> | null) || {};
  await db.from("dreamland_profiles").upsert({
    user_id: userId,
    last_context: { ...ctx, active_session_id: sessionId },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

export async function loadShortTermMemory(db: SupabaseClient, sessionId: string): Promise<ShortTermMemory> {
  const { data } = await db.from("dreamland_sessions").select("short_term_memory").eq("session_id", sessionId).maybeSingle();
  return (data?.short_term_memory as ShortTermMemory) || {};
}

export async function updateShortTermMemory(
  db: SupabaseClient,
  sessionId: string,
  patch: Partial<ShortTermMemory>
) {
  const current = await loadShortTermMemory(db, sessionId);
  await db.from("dreamland_sessions").update({
    short_term_memory: { ...current, ...patch, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }).eq("session_id", sessionId);
}

export async function learnFromFeedback(
  db: SupabaseClient,
  userId: string,
  opts: { action: string; rating?: number | null; restaurantId?: string | null; notes?: string | null }
) {
  const key = opts.action === "saved" ? "saved_restaurant" : opts.rating && opts.rating >= 4 ? "liked_meal" : opts.rating && opts.rating <= 2 ? "disliked_meal" : null;
  if (!key || !opts.restaurantId) return;

  const value = opts.notes || opts.restaurantId;
  const { data: existing } = await db
    .from("dreamland_memory")
    .select("memory_id,confidence")
    .eq("user_id", userId)
    .eq("memory_key", key)
    .maybeSingle();

  const confidence = Math.min(0.95, Number(existing?.confidence || 0.5) + 0.1);
  if (existing?.memory_id) {
    await db.from("dreamland_memory").update({
      memory_value: value,
      confidence,
      source: "feedback",
      updated_at: new Date().toISOString(),
    }).eq("memory_id", existing.memory_id);
  } else {
    await db.from("dreamland_memory").insert({
      memory_id: uid("dmem"),
      user_id: userId,
      memory_key: key,
      memory_value: value,
      confidence,
      source: "feedback",
    });
  }
}

export async function countOrdersSinceRefresh(db: SupabaseClient, userId: string, sinceIso?: string | null): Promise<number> {
  let q = db
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .eq("customer_id", userId)
    .eq("status", "delivered");
  if (sinceIso) q = q.gte("updated_at", sinceIso);
  const { count } = await q;
  return count || 0;
}
