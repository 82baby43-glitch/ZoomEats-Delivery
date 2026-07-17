import type { SupabaseClient } from "@supabase/supabase-js";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function trackDreamlandEvent(
  db: SupabaseClient,
  eventType: string,
  payload: Record<string, unknown> = {},
  userId?: string | null
) {
  try {
    await db.from("dreamland_analytics").insert({
      event_id: uid("dla"),
      user_id: userId || null,
      event_type: eventType,
      payload,
    });
  } catch {
    // analytics is best-effort
  }
}

export async function getDreamlandAdminAnalytics(db: SupabaseClient) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: conversations },
    { data: moodEvents },
    { count: recommendations },
    { data: feedbackRows },
    { data: refreshEvents },
    { data: topRecs },
  ] = await Promise.all([
    db.from("dreamland_conversations").select("message_id", { count: "exact", head: true }).gte("created_at", since),
    db.from("dreamland_analytics").select("payload").eq("event_type", "mood_selected").gte("created_at", since).limit(500),
    db.from("dreamland_recommendations").select("recommendation_id", { count: "exact", head: true }).gte("created_at", since),
    db.from("dreamland_feedback").select("action,rating").gte("created_at", since).limit(1000),
    db.from("dreamland_analytics").select("event_id").eq("event_type", "chat_refresh").gte("created_at", since),
    db
      .from("dreamland_recommendations")
      .select("restaurant_id,match_score,why")
      .gte("created_at", since)
      .order("match_score", { ascending: false })
      .limit(10),
  ]);

  const moodCounts: Record<string, number> = {};
  for (const row of moodEvents || []) {
    const mood = String((row.payload as { mood?: string })?.mood || "unknown");
    moodCounts[mood] = (moodCounts[mood] || 0) + 1;
  }

  const ordered = (feedbackRows || []).filter((f) => f.action === "ordered").length;
  const saved = (feedbackRows || []).filter((f) => f.action === "saved").length;
  const rated = (feedbackRows || []).filter((f) => f.action === "rated" && f.rating);
  const satisfaction = rated.length
    ? rated.reduce((s, r) => s + Number(r.rating || 0), 0) / rated.length
    : null;

  const conversionRate = recommendations ? Math.round((ordered / Math.max(1, recommendations)) * 1000) / 10 : 0;

  return {
    period_days: 30,
    conversations: conversations || 0,
    mood_selections: moodCounts,
    recommendations_shown: recommendations || 0,
    orders_from_dreamland: ordered,
    conversion_rate_pct: conversionRate,
    satisfaction_avg: satisfaction ? Math.round(satisfaction * 10) / 10 : null,
    refresh_usage: (refreshEvents || []).length,
    saves: saved,
    top_recommendations: topRecs || [],
  };
}
