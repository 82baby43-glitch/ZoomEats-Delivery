import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDreamlandSystemPrompt, DREAMLAND_SEED_MESSAGE } from "../dreamland/prompts";
import { moodPhrase } from "../dreamland/emotions";
import { conversationalFallback, shouldRecommend } from "../dreamland/intent";
import { buildContext } from "../dreamland/context";
import { buildCollections, buildHomeSections } from "../dreamland/collections";
import {
  generateRecommendations,
  learnFromText,
  loadUserState,
  memoryBlob,
  persistRecommendations,
} from "../dreamland/recommend";
import { loadLastWin } from "../dreamland/lastWin";
import type { Mood } from "../dreamland/emotions";
import { analyzeMessage } from "../dreamland/analysis";
import { resolveUiMood } from "../dreamland/moodUi";
import {
  countOrdersSinceRefresh,
  getActiveSessionId,
  learnFromFeedback,
  loadShortTermMemory,
  setActiveSessionId,
  updateShortTermMemory,
} from "../dreamland/memory";
import { getDreamlandAdminAnalytics, trackDreamlandEvent } from "../dreamland/analytics";
import { buildRestaurantIntelStub } from "../dreamland/restaurantIntel";

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
  const sid = sessionId || (await getActiveSessionId(db, userId));
  const { data: existing } = await db.from("dreamland_sessions").select("session_id").eq("session_id", sid).maybeSingle();
  if (!existing) {
    await db.from("dreamland_sessions").insert({
      session_id: sid,
      user_id: userId,
      context: {},
      is_active: true,
      refreshed_at: new Date().toISOString(),
    });
    await setActiveSessionId(db, userId, sid);
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
    requireAdmin?: () => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = opts;
  const anthropicKey = opts.anthropicKey || "";

  const isDreamland = path.startsWith("/dreamland") || path === "/chat" || path === "/chat/history";
  if (!isDreamland) return null;

  const route = path === "/chat" ? "/dreamland/chat" : path === "/chat/history" ? "/dreamland/history" : path;

  if (route === "/dreamland/admin/analytics" && method === "GET") {
    opts.requireAdmin?.();
    return getDreamlandAdminAnalytics(db);
  }

  if (route === "/dreamland/restaurant-intel" && method === "GET") {
    opts.requireAuth();
    const restaurantId = params.restaurant_id || "";
    if (!restaurantId) throwErr("restaurant_id required");
    return buildRestaurantIntelStub(restaurantId);
  }

  if (route === "/dreamland/session" && method === "GET") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const sessionId = await getActiveSessionId(db, userId);
    const { data: session } = await db
      .from("dreamland_sessions")
      .select("session_id,mood,refreshed_at,short_term_memory")
      .eq("session_id", sessionId)
      .maybeSingle();
    const ordersSinceRefresh = await countOrdersSinceRefresh(db, userId, session?.refreshed_at || null);
    const { data: recentSessions } = await db
      .from("dreamland_sessions")
      .select("session_id,created_at,refreshed_at,mood")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(5);

    return {
      session_id: sessionId,
      mood: session?.mood || null,
      short_term: session?.short_term_memory || {},
      orders_since_refresh: ordersSinceRefresh,
      show_refresh_prompt: ordersSinceRefresh >= 3,
      recent_sessions: recentSessions || [],
    };
  }

  if (route === "/dreamland/refresh" && method === "POST") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const oldSession = await getActiveSessionId(db, userId);
    await db.from("dreamland_sessions").update({ is_active: false }).eq("session_id", oldSession);

    const newSessionId = `dreamland_${userId}_${Date.now()}`;
    await db.from("dreamland_sessions").insert({
      session_id: newSessionId,
      user_id: userId,
      context: {},
      short_term_memory: {},
      is_active: true,
      refreshed_at: new Date().toISOString(),
    });
    await setActiveSessionId(db, userId, newSessionId);
    await trackDreamlandEvent(db, "chat_refresh", { old_session: oldSession }, userId);

    return {
      ok: true,
      session_id: newSessionId,
      seed_message: DREAMLAND_SEED_MESSAGE,
    };
  }

  if (route === "/dreamland/more" && method === "GET") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const excludeRestaurants = (params.exclude_restaurants || "").split(",").filter(Boolean);
    const excludeItems = (params.exclude_items || "").split(",").filter(Boolean);
    const mood = (params.mood as Mood) || null;

    const { recommendations } = await generateRecommendations(db, {
      userId,
      mood,
      excludeRestaurantIds: excludeRestaurants,
      excludeMenuItemIds: excludeItems,
      limit: params.limit ? Number(params.limit) : 4,
    });

    await trackDreamlandEvent(db, "show_more", { count: recommendations.length }, userId);
    return { recommendations };
  }

  if (route === "/dreamland/history" && method === "GET") {
    const u = opts.requireAuth();
    const sessionId = params.session_id || (await getActiveSessionId(db, String(u.user_id)));
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

    const analysis = analyzeMessage(text);
    const intent = analysis.intent;
    const wantsFood = shouldRecommend(intent, text);

    const { recommendations, mood, cravings, ctx } = wantsFood
      ? await generateRecommendations(db, {
          userId,
          text,
          moodUiId: body.mood_ui_id as string | undefined,
          budgetMax: body.budget_max != null ? Number(body.budget_max) : undefined,
          wantsHealthy: body.wants_healthy != null ? Boolean(body.wants_healthy) : undefined,
          wantsFast: body.wants_fast != null ? Boolean(body.wants_fast) : undefined,
          weather: body.weather as string | undefined,
          limit: analysis.recommendLimit,
        })
      : { recommendations: [], mood: null, cravings: [], ctx: buildContext() };

    const state = await loadUserState(db, userId);
    const contextBlob = wantsFood ? formatRecContext(recommendations) : "";
    const system = buildDreamlandSystemPrompt({
      mood,
      contextBlob,
      memoryBlob: memoryBlob(state),
      intent,
    });

    const history = await loadConversationHistory(db, sessionId);
    const messages = [
      ...history.filter((m) => m.role === "user" || m.role === "assistant"),
      { role: "user", content: text },
    ];

    let reply = conversationalFallback(intent, String(u.name || "").split(" ")[0] || undefined);

    if (wantsFood && recommendations[0]) {
      const top = recommendations[0];
      const lead =
        analysis.responseStyle === "supportive"
          ? "I hear you — let's keep this simple."
          : analysis.responseStyle === "simple"
            ? "No overthinking needed."
            : moodPhrase(mood);
      reply = `${lead} ${top.why} I'd go with ${top.restaurant_name} — ${top.match_score}% ${top.match_label}.`;
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
            max_tokens: 500,
            system: `${system}\n\nEmotional analysis: ${analysis.summary}. Style: ${analysis.responseStyle}.`,
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
      recommendations: wantsFood ? recommendations.slice(0, 3) : [],
    });

    if (wantsFood) {
      await persistRecommendations(db, userId, sessionId, recommendations, mood);
      await updateShortTermMemory(db, sessionId, {
        current_mood: mood,
        current_search: text,
        last_recommendation_ids: recommendations.slice(0, 5).map((r) => r.menu_item_id || r.restaurant_id),
      });
    }

    if (mood) {
      await db.from("dreamland_profiles").update({ last_mood: mood, updated_at: new Date().toISOString() }).eq("user_id", userId);
      await db.from("dreamland_sessions").update({ mood, updated_at: new Date().toISOString() }).eq("session_id", sessionId);
    }

    await trackDreamlandEvent(db, "chat_message", { wants_food: wantsFood, mood }, userId);

    try {
      await db.from("chat_messages").insert([
        { session_id: `chat_${userId}`, user_id: userId, role: "user", text },
        { session_id: `chat_${userId}`, user_id: userId, role: "assistant", text: reply },
      ]);
    } catch {
      // legacy table may not exist
    }

    const ordersSinceRefresh = await countOrdersSinceRefresh(
      db,
      userId,
      (await db.from("dreamland_sessions").select("refreshed_at").eq("session_id", sessionId).maybeSingle()).data?.refreshed_at
    );

    return {
      reply,
      session_id: sessionId,
      mood,
      cravings,
      analysis,
      recommendations: recommendations.slice(0, 5),
      context: { greeting: ctx.greeting, timeLabel: ctx.timeLabel },
      orders_since_refresh: ordersSinceRefresh,
      show_refresh_prompt: ordersSinceRefresh >= 3,
    };
  }

  if (route === "/dreamland/recommend" && method === "GET") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const { recommendations, mood, cravings, ctx, analysis } = await generateRecommendations(db, {
      userId,
      text: params.q || params.text || "",
      mood: (params.mood as Mood) || null,
      budgetMax: params.budget ? Number(params.budget) : undefined,
      wantsHealthy: params.healthy === "1",
      wantsFast: params.fast === "1",
      limit: params.limit ? Number(params.limit) : 8,
    });
    return { recommendations, mood, cravings, context: ctx, analysis };
  }

  if (route === "/dreamland/mood" && method === "POST") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const moodInput = String(body.mood || "");
    const mood = (resolveUiMood(moodInput) || moodInput) as Mood;
    const sessionId = await ensureSession(db, userId);
    await db.from("dreamland_sessions").update({ mood, updated_at: new Date().toISOString() }).eq("session_id", sessionId);
    await db.from("dreamland_profiles").update({ last_mood: mood, updated_at: new Date().toISOString() }).eq("user_id", userId);

    const { recommendations } = await generateRecommendations(db, {
      userId,
      moodUiId: moodInput,
      mood: mood || null,
      limit: 6,
    });

    await trackDreamlandEvent(db, "mood_selected", { mood: moodInput }, userId);
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
    const shortTerm = await loadShortTermMemory(db, sessionId);
    const { recommendations, mood, ctx } = await generateRecommendations(db, {
      userId,
      limit: 12,
      excludeRecentOrders: true,
      excludeRestaurantIds: (shortTerm.last_recommendation_ids || []).filter((id) => id.startsWith("rest_")),
    });
    const pick = recommendations[Math.floor(Math.random() * Math.min(5, recommendations.length))] || recommendations[0];
    if (!pick) return { surprise: null, message: "No restaurants available right now." };

    const reply = `✨ Surprise! Dreamland picked **${pick.restaurant_name}** — ${pick.menu_item_name || "their best seller"} (${pick.match_score}% ${pick.match_label}). ${pick.why}`;
    await saveMessage(db, { sessionId, userId, role: "assistant", text: reply, mood, recommendations: [pick] });
    await persistRecommendations(db, userId, sessionId, [pick], mood);
    await trackDreamlandEvent(db, "surprise", { restaurant_id: pick.restaurant_id }, userId);

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
    const rating = body.rating != null ? Number(body.rating) : null;
    await db.from("dreamland_feedback").insert({
      feedback_id: uid("dfb"),
      user_id: userId,
      recommendation_id: body.recommendation_id || null,
      restaurant_id: body.restaurant_id || null,
      action,
      rating,
      notes: body.notes || null,
    });

    await learnFromFeedback(db, userId, {
      action,
      rating,
      restaurantId: body.restaurant_id as string | null,
      notes: body.notes as string | null,
    });

    if (action === "ordered") {
      await db.from("dreamland_profiles").upsert({
        user_id: userId,
        dreamland_order_count: 1,
      }, { onConflict: "user_id" });
    }

    await trackDreamlandEvent(db, "feedback", { action, rating }, userId);
    return { ok: true };
  }

  if (route === "/dreamland/home" && method === "GET") {
    const u = opts.requireAuth();
    const userId = String(u.user_id);
    const [{ recommendations, ctx }, last_win] = await Promise.all([
      generateRecommendations(db, { userId, limit: 20 }),
      loadLastWin(db, userId),
    ]);
    const collections = buildCollections(recommendations, ctx);
    const sections = buildHomeSections(recommendations, ctx, collections);
    return {
      greeting: ctx.greeting,
      timeLabel: ctx.timeLabel,
      isWeekend: ctx.isWeekend,
      sections,
      collections,
      top_picks: recommendations.slice(0, 6),
      last_win,
    };
  }

  if (route.startsWith("/dreamland")) {
    throwErr("Dreamland route not found", 404);
  }

  return null;
}
