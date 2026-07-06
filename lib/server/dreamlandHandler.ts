import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDreamlandSystemPrompt, DREAMLAND_SEED_MESSAGE } from "../dreamland/prompts";
import { moodPhrase } from "../dreamland/emotions";
import { buildCollections, buildHomeSections } from "../dreamland/collections";
import {
  generateRecommendations,
  learnFromText,
  loadUserState,
  memoryBlob,
  persistRecommendations,
} from "../dreamland/recommend";
import type { Mood } from "../dreamland/emotions";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function formatRecContext(recs: Awaited<ReturnType<typeof generateRecommendations>>["recommendations"]) {
  return recs
    .slice(0, 6)
    .map(
      (r, i) =>
        `${i + 1}. ${r.restaurant_name} (${r.cuisine}) — ${r.menu_item_name || "popular items"} $${r.menu_item_price?.toFixed(2) || ""} — ${r.match_score}% ${r.match_label}\n   Why: ${r.why}`
    )
    .join("\n");
}

async function ensureSession(db: SupabaseClient, userId: string, sessionId?: string) {
  const sid = sessionId || `dreamland_${userId}`;
  const { data: existing } = await db.from("dreamland_sessions").select("session_id").eq("session_id", sid).maybeSingle();
  if (!existing) {
    await db.from("dreamland_sessions").insert({
      session_id: sid,
      user_id: userId,
      context: {},
    });
  }
  await db.from("dreamland_profiles").upsert({
    user_id: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  return sid;
}

async function loadConversationHistory(db: SupabaseClient, sessionId: string, limit = 12) {
  const { data } = await db
    .from("dreamland_conversations")
    .select("role,text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data || []).map((m) => ({ role: m.role as string, content: m.text as string }));
}

async function saveMessage(
  db: SupabaseClient,
  opts: {
    sessionId: string;
    userId: string;
    role: string;
    text: string;
    mood?: Mood | null;
    recommendations?: unknown;
  }
) {
  await db.from("dreamland_conversations").insert({
    message_id: uid("dmsg"),
    session_id: opts.sessionId,
    user_id: opts.userId,
    role: opts.role,
    text: opts.text,
    mood: opts.mood || null,
    recommendations: opts.recommendations || null,
  });
}

export async function handleDreamlandRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    anthropicKey?: string;
    requireAuth: () => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = opts;
  const anthropicKey = opts.anthropicKey || "";

  const isDreamland = path.startsWith("/dreamland") || path === "/chat" || path === "/chat/history";
  if (!isDreamland) return null;

  // Legacy chat aliases → dreamland
  const route = path === "/chat" ? "/dreamland/chat" : path === "/chat/history" ? "/dreamland/history" : path;

  if (route === "/dreamland/history" && method === "GET") {
    const u = opts.requireAuth();
    const sessionId = params.session_id || `dreamland_${u.user_id}`;
    const { data } = await db
      .from("dreamland_conversations")
      .select("role,text,recommendations,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (data?.length) {
      return data.map((m) => ({
        role: m.role,
        text: m.text,
        recommendations: m.recommendations,
      }));
    }

    // Fallback legacy chat_messages
    const legacyId = `chat_${u.user_id}`;
    const { data: legacy } = await db
      .from("chat_messages")
      .select("*")
      .eq("session_id", legacyId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (legacy?.length) {
      return legacy.map((m) => ({ role: m.role, text: m.text }));
    }
    return [{ role: "assistant", text: DREAMLAND_SEED_MESSAGE }];
  }

  if (route === "/dreamland/chat" && method === "POST") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const text = String(body.text || "").trim();
    if (!text) throwErr("Message required");

    const sessionId = await ensureSession(db, userId, body.session_id as string | undefined);
    await learnFromText(db, userId, text);

    const { recommendations, mood, cravings, ctx } = await generateRecommendations(db, {
      userId,
      text,
      budgetMax: body.budget_max != null ? Number(body.budget_max) : undefined,
      wantsHealthy: body.wants_healthy != null ? Boolean(body.wants_healthy) : undefined,
      wantsFast: body.wants_fast != null ? Boolean(body.wants_fast) : undefined,
      weather: body.weather as string | undefined,
    });

    const state = await loadUserState(db, userId);
    const contextBlob = formatRecContext(recommendations);
    const system = buildDreamlandSystemPrompt({
      mood,
      contextBlob,
      memoryBlob: memoryBlob(state),
    });

    const history = await loadConversationHistory(db, sessionId);
    const messages = [
      ...history.filter((m) => m.role === "user" || m.role === "assistant"),
      { role: "user", content: text },
    ];

    let reply = mood
      ? `${moodPhrase(mood)} `
      : "I got you. ";

    if (recommendations[0]) {
      const top = recommendations[0];
      reply += `${top.why} Check out **${top.restaurant_name}** — ${top.match_score}% ${top.match_label}.`;
    } else {
      reply += "Browse our featured restaurants — something good is always nearby.";
    }

    if (anthropicKey) {
      try {
        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 400,
            system,
            messages,
          }),
        });
        const aiData = await aiRes.json();
        const llmText = aiData.content?.[0]?.text;
        if (llmText) reply = llmText;
      } catch (e) {
        console.error("Dreamland LLM error:", e);
      }
    }

    await saveMessage(db, { sessionId, userId, role: "user", text, mood });
    await saveMessage(db, {
      sessionId,
      userId,
      role: "assistant",
      text: reply,
      mood,
      recommendations: recommendations.slice(0, 3),
    });

    await persistRecommendations(db, userId, sessionId, recommendations, mood);

    if (mood) {
      await db.from("dreamland_profiles").update({ last_mood: mood, updated_at: new Date().toISOString() }).eq("user_id", userId);
      await db.from("dreamland_sessions").update({ mood, updated_at: new Date().toISOString() }).eq("session_id", sessionId);
    }

    // Legacy chat_messages sync
    try {
      await db.from("chat_messages").insert([
        { session_id: `chat_${userId}`, user_id: userId, role: "user", text },
        { session_id: `chat_${userId}`, user_id: userId, role: "assistant", text: reply },
      ]);
    } catch {
      // legacy table may not exist in all environments
    }

    return {
      reply,
      session_id: sessionId,
      mood,
      cravings,
      recommendations: recommendations.slice(0, 5),
      context: { greeting: ctx.greeting, timeLabel: ctx.timeLabel },
    };
  }

  if (route === "/dreamland/recommend" && method === "GET") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const { recommendations, mood, cravings, ctx } = await generateRecommendations(db, {
      userId,
      text: params.q || params.text || "",
      mood: (params.mood as Mood) || null,
      budgetMax: params.budget ? Number(params.budget) : undefined,
      wantsHealthy: params.healthy === "1",
      wantsFast: params.fast === "1",
      limit: params.limit ? Number(params.limit) : 8,
    });
    return { recommendations, mood, cravings, context: ctx };
  }

  if (route === "/dreamland/mood" && method === "POST") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const mood = String(body.mood || "") as Mood;
    const sessionId = await ensureSession(db, userId);
    await db.from("dreamland_sessions").update({ mood, updated_at: new Date().toISOString() }).eq("session_id", sessionId);
    await db.from("dreamland_profiles").update({ last_mood: mood, updated_at: new Date().toISOString() }).eq("user_id", userId);

    const { recommendations } = await generateRecommendations(db, {
      userId,
      mood: mood || null,
      limit: 6,
    });
    return { mood, phrase: moodPhrase(mood || null), recommendations };
  }

  if (route === "/dreamland/preferences" && method === "GET") {
    const u = opts.requireAuth();
    const state = await loadUserState(db, String(u.user_id));
    return state.preferences;
  }

  if (route === "/dreamland/preferences" && method === "PUT") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const payload = {
      user_id: userId,
      dietary_restrictions: Array.isArray(body.dietary_restrictions) ? body.dietary_restrictions : undefined,
      favorite_cuisines: Array.isArray(body.favorite_cuisines) ? body.favorite_cuisines : undefined,
      avoid_ingredients: Array.isArray(body.avoid_ingredients) ? body.avoid_ingredients : undefined,
      budget_max: body.budget_max != null ? Number(body.budget_max) : undefined,
      prefers_healthy: body.prefers_healthy != null ? Boolean(body.prefers_healthy) : undefined,
      prefers_fast: body.prefers_fast != null ? Boolean(body.prefers_fast) : undefined,
      updated_at: new Date().toISOString(),
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    await db.from("dreamland_preferences").upsert(clean, { onConflict: "user_id" });
    return { ok: true };
  }

  if (route === "/dreamland/surprise" && method === "POST") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const sessionId = await ensureSession(db, userId);
    const { recommendations, mood, ctx } = await generateRecommendations(db, {
      userId,
      limit: 12,
    });
    const pick = recommendations[Math.floor(Math.random() * Math.min(5, recommendations.length))] || recommendations[0];
    if (!pick) return { surprise: null, message: "No restaurants available right now." };

    const reply = `✨ Surprise! I picked **${pick.restaurant_name}** — ${pick.menu_item_name || "their best seller"} (${pick.match_score}% ${pick.match_label}). ${pick.why}`;
    await saveMessage(db, { sessionId, userId, role: "assistant", text: reply, mood, recommendations: [pick] });
    await persistRecommendations(db, userId, sessionId, [pick], mood);

    return {
      surprise: pick,
      message: reply,
      why: pick.why,
      why_now: pick.why_now,
      satisfaction_score: pick.satisfaction_score,
      context: ctx,
    };
  }

  if (route === "/dreamland/feedback" && method === "POST") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const action = String(body.action || "accepted");
    await db.from("dreamland_feedback").insert({
      feedback_id: uid("dfb"),
      user_id: userId,
      recommendation_id: body.recommendation_id || null,
      restaurant_id: body.restaurant_id || null,
      action,
      rating: body.rating != null ? Number(body.rating) : null,
      notes: body.notes || null,
    });
    return { ok: true };
  }

  if (route === "/dreamland/home" && method === "GET") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const { recommendations, ctx } = await generateRecommendations(db, { userId, limit: 20 });
    const collections = buildCollections(recommendations, ctx);
    const sections = buildHomeSections(recommendations, ctx, collections);
    return {
      greeting: ctx.greeting,
      timeLabel: ctx.timeLabel,
      isWeekend: ctx.isWeekend,
      sections,
      collections,
      top_picks: recommendations.slice(0, 6),
    };
  }

  if (route.startsWith("/dreamland")) {
    throwErr("Dreamland route not found", 404);
  }

  return null;
}
