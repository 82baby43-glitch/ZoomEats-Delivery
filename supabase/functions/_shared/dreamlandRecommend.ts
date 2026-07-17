import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoredRecommendation } from "./dreamlandScoring.ts";
import { buildContext } from "./dreamlandContext.ts";
import { detectMood } from "./dreamlandEmotions.ts";
import { detectCravings } from "./dreamlandCravings.ts";
import { loadRestaurantData, rankRecommendations } from "./dreamlandScoring.ts";
import type { Mood } from "./dreamlandEmotions.ts";
import { analyzeMessage } from "./dreamlandAnalysis.ts";
import { moodModeRules, resolveUiMood } from "./dreamlandMoodUi.ts";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export type DreamlandUserState = {
  preferences: {
    dietary_restrictions: string[];
    favorite_cuisines: string[];
    avoid_ingredients: string[];
    budget_max: number | null;
    prefers_healthy: boolean | null;
    prefers_fast: boolean | null;
  };
  memory: Array<{ key: string; value: string; confidence: number }>;
  orderHistory: Array<{ restaurant_id: string; cuisine: string; total: number }>;
};

export async function loadUserState(db: SupabaseClient, userId: string): Promise<DreamlandUserState> {
  const [{ data: prefs }, { data: memories }, { data: orders }] = await Promise.all([
    db.from("dreamland_preferences").select("*").eq("user_id", userId).maybeSingle(),
    db.from("dreamland_memory").select("memory_key,memory_value,confidence").eq("user_id", userId).order("confidence", { ascending: false }).limit(20),
    db.from("orders").select("restaurant_id,total,restaurants(cuisine)").eq("customer_id", userId).eq("payment_status", "paid").order("created_at", { ascending: false }).limit(30),
  ]);

  const orderHistory = (orders || []).map((o) => ({
    restaurant_id: o.restaurant_id as string,
    cuisine: String((o.restaurants as { cuisine?: string } | null)?.cuisine || ""),
    total: Number(o.total || 0),
  }));

  return {
    preferences: {
      dietary_restrictions: (prefs?.dietary_restrictions as string[]) || [],
      favorite_cuisines: (prefs?.favorite_cuisines as string[]) || [],
      avoid_ingredients: (prefs?.avoid_ingredients as string[]) || [],
      budget_max: prefs?.budget_max != null ? Number(prefs.budget_max) : null,
      prefers_healthy: prefs?.prefers_healthy ?? null,
      prefers_fast: prefs?.prefers_fast ?? null,
    },
    memory: (memories || []).map((m) => ({
      key: m.memory_key as string,
      value: m.memory_value as string,
      confidence: Number(m.confidence || 0.5),
    })),
    orderHistory,
  };
}

export function inferPreferencesFromOrders(state: DreamlandUserState) {
  const cuisineCounts = new Map<string, number>();
  for (const o of state.orderHistory) {
    if (!o.cuisine) continue;
    cuisineCounts.set(o.cuisine, (cuisineCounts.get(o.cuisine) || 0) + 1);
  }
  const topCuisines = [...cuisineCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);
  return {
    favoriteCuisines: [...new Set([...state.preferences.favorite_cuisines, ...topCuisines])],
    avgSpend: state.orderHistory.length
      ? state.orderHistory.reduce((s, o) => s + o.total, 0) / state.orderHistory.length
      : null,
  };
}

export function memoryBlob(state: DreamlandUserState): string {
  const lines: string[] = [];
  for (const m of state.memory) lines.push(`- ${m.key}: ${m.value}`);
  const inferred = inferPreferencesFromOrders(state);
  if (inferred.favoriteCuisines.length) {
    lines.push(`- Usually orders: ${inferred.favoriteCuisines.join(", ")}`);
  }
  if (inferred.avgSpend) lines.push(`- Typical order: ~$${inferred.avgSpend.toFixed(0)}`);
  return lines.join("\n");
}

export async function generateRecommendations(
  db: SupabaseClient,
  opts: {
    userId: string;
    text?: string;
    mood?: Mood | null;
    moodUiId?: string;
    budgetMax?: number | null;
    wantsHealthy?: boolean;
    wantsFast?: boolean;
    limit?: number;
    weather?: string;
    excludeRecentOrders?: boolean;
    excludeRestaurantIds?: string[];
    excludeMenuItemIds?: string[];
  }
): Promise<{
  recommendations: ScoredRecommendation[];
  mood: Mood | null;
  cravings: string[];
  ctx: ReturnType<typeof buildContext>;
  analysis?: ReturnType<typeof analyzeMessage>;
}> {
  const text = opts.text || "";
  const resolvedMood = opts.mood || resolveUiMood(opts.moodUiId || "") || detectMood(text);
  const analysis = analyzeMessage(text, resolvedMood);
  const modeRules = moodModeRules(resolvedMood, opts.moodUiId);
  const cravings = detectCravings(text);
  const ctx = buildContext(new Date(), opts.weather);
  const state = await loadUserState(db, opts.userId);
  const inferred = inferPreferencesFromOrders(state);
  const { restaurants, menuItems, orderCounts, maxOrders } = await loadRestaurantData(db);

  const excludeRestaurantIds = [...(opts.excludeRestaurantIds || [])];
  const excludeMenuItemIds = [...(opts.excludeMenuItemIds || [])];

  if (opts.excludeRecentOrders && state.orderHistory.length) {
    const recent = state.orderHistory.slice(0, 5);
    excludeRestaurantIds.push(...recent.map((o) => o.restaurant_id));
  }

  const budgetFromText = text.match(/under\s*\$?\s*(\d+)/i);
  const budgetMax =
    opts.budgetMax ??
    state.preferences.budget_max ??
    (budgetFromText ? Number(budgetFromText[1]) : null) ??
    (modeRules.budgetBias && inferred.avgSpend ? inferred.avgSpend * modeRules.budgetBias : null);

  const recommendations = rankRecommendations(restaurants, menuItems, {
    mood: resolvedMood,
    cravings,
    ctx,
    orderCounts,
    maxOrders,
    budgetMax,
    wantsHealthy: opts.wantsHealthy ?? modeRules.wantsHealthy ?? state.preferences.prefers_healthy ?? undefined,
    wantsFast: opts.wantsFast ?? modeRules.wantsFast ?? analysis.timeSensitive ?? state.preferences.prefers_fast ?? undefined,
    favoriteCuisines: inferred.favoriteCuisines,
    avoidIngredients: state.preferences.avoid_ingredients,
    limit: opts.limit || modeRules.limitChoices || analysis.recommendLimit || 8,
    excludeRestaurantIds: [...new Set(excludeRestaurantIds)],
    excludeMenuItemIds: [...new Set(excludeMenuItemIds)],
  });

  return { recommendations, mood: resolvedMood, cravings, ctx, analysis };
}

export async function persistRecommendations(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
  recs: ScoredRecommendation[],
  mood: Mood | null
) {
  if (!recs.length) return;
  const rows = recs.slice(0, 5).map((r) => ({
    recommendation_id: uid("drec"),
    user_id: userId,
    session_id: sessionId,
    restaurant_id: r.restaurant_id,
    menu_item_id: r.menu_item_id,
    match_score: r.match_score,
    match_label: r.match_label,
    emotion_match: r.score_breakdown.emotion,
    craving_match: r.score_breakdown.craving,
    score_breakdown: r.score_breakdown,
    why: r.why,
    why_now: r.why_now,
    why_restaurant: r.why_restaurant,
    why_meal: r.why_meal,
    satisfaction_score: r.satisfaction_score,
    mood,
  }));
  await db.from("dreamland_recommendations").insert(rows);
}

export async function learnFromText(db: SupabaseClient, userId: string, text: string) {
  const lower = text.toLowerCase();
  const updates: Array<{ key: string; value: string }> = [];
  if (lower.includes("spicy") || lower.includes("hot")) updates.push({ key: "likes_spicy", value: "true" });
  if (lower.includes("vegetarian") || lower.includes("vegan")) updates.push({ key: "diet", value: "vegetarian" });
  if (lower.includes("no seafood") || lower.includes("avoid seafood")) updates.push({ key: "avoids", value: "seafood" });
  if (lower.includes("healthy")) updates.push({ key: "prefers_healthy", value: "true" });
  if (lower.includes("sushi")) updates.push({ key: "loves", value: "sushi" });
  if (lower.includes("taco")) updates.push({ key: "loves", value: "tacos" });

  for (const u of updates) {
    try {
      const { data: existing } = await db
        .from("dreamland_memory")
        .select("memory_id")
        .eq("user_id", userId)
        .eq("memory_key", u.key)
        .maybeSingle();
      if (existing?.memory_id) {
        await db.from("dreamland_memory").update({
          memory_value: u.value,
          confidence: 0.7,
          updated_at: new Date().toISOString(),
        }).eq("memory_id", existing.memory_id);
      } else {
        await db.from("dreamland_memory").insert({
          memory_id: uid("dmem"),
          user_id: userId,
          memory_key: u.key,
          memory_value: u.value,
          confidence: 0.7,
          source: "conversation",
        });
      }
    } catch {
      // memory write is best-effort
    }
  }
}
