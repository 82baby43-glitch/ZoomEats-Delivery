import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mood } from "./dreamlandEmotions.ts";
import { moodCuisines } from "./dreamlandEmotions.ts";
import { itemMatchesCraving } from "./dreamlandCravings.ts";
import type { DreamlandContext } from "./dreamlandContext.ts";
import { filterPublicRestaurants } from "./restaurants.ts";

export const SCORE_WEIGHTS = {
  emotion: 0.35,
  craving: 0.20,
  rating: 0.10,
  distance: 0.10,
  deliveryTime: 0.10,
  popularity: 0.05,
  health: 0.05,
  promotions: 0.05,
} as const;

export type ScoredRecommendation = {
  restaurant_id: string;
  restaurant_name: string;
  cuisine: string;
  image_url: string;
  rating: number;
  delivery_time_min: number;
  menu_item_id: string | null;
  menu_item_name: string | null;
  menu_item_price: number | null;
  match_score: number;
  match_label: string;
  score_breakdown: Record<string, number>;
  why: string;
  why_now: string;
  why_restaurant: string;
  why_meal: string;
  satisfaction_score: number;
};

type RestaurantRow = {
  restaurant_id: string;
  name: string;
  cuisine: string;
  rating: number;
  delivery_time_min: number;
  image_url: string;
  description: string;
  accepting_orders?: boolean;
};

type MenuRow = {
  item_id: string;
  restaurant_id: string;
  name: string;
  price: number;
  category: string;
  available: boolean;
};

function matchLabel(score: number) {
  if (score >= 95) return "Perfect Match";
  if (score >= 88) return "Great Match";
  if (score >= 80) return "Good Match";
  if (score >= 70) return "Solid Pick";
  return "Worth a Try";
}

function emotionScore(cuisine: string, mood: Mood | null): number {
  if (!mood) return 0.6;
  const targets = moodCuisines(mood).map((c) => c.toLowerCase());
  const c = cuisine.toLowerCase();
  for (const t of targets) {
    if (c.includes(t) || t.includes(c)) return 1;
  }
  return 0.35;
}

function ratingScore(rating: number): number {
  return Math.min(1, Math.max(0.3, rating / 5));
}

function deliveryScore(mins: number, wantsFast?: boolean): number {
  const base = mins <= 20 ? 1 : mins <= 30 ? 0.85 : mins <= 45 ? 0.65 : 0.4;
  return wantsFast ? base : base * 0.9 + 0.1;
}

function healthScore(itemName: string, category: string, wantsHealthy?: boolean): number {
  const blob = `${itemName} ${category}`.toLowerCase();
  const healthy = ["salad", "bowl", "grilled", "veggie", "poke", "soup"].some((k) => blob.includes(k));
  const indulgent = ["burger", "fries", "fried", "pizza", "dessert"].some((k) => blob.includes(k));
  if (wantsHealthy) return healthy ? 1 : indulgent ? 0.2 : 0.6;
  return indulgent ? 0.7 : 0.5;
}

function popularityScore(orderCount: number, maxOrders: number): number {
  if (maxOrders <= 0) return 0.5;
  return 0.4 + (orderCount / maxOrders) * 0.6;
}

function budgetScore(price: number, budgetMax?: number | null): number {
  if (!budgetMax) return 0.7;
  if (price <= budgetMax) return 1;
  if (price <= budgetMax * 1.2) return 0.6;
  return 0.25;
}

export function scoreRestaurantItem(opts: {
  restaurant: RestaurantRow;
  item: MenuRow | null;
  mood: Mood | null;
  cravings: string[];
  ctx: DreamlandContext;
  orderCount?: number;
  maxOrders?: number;
  budgetMax?: number | null;
  wantsHealthy?: boolean;
  wantsFast?: boolean;
  favoriteCuisines?: string[];
  avoidIngredients?: string[];
}): ScoredRecommendation | null {
  const { restaurant: r, item } = opts;
  if (opts.avoidIngredients?.length && item) {
    const blob = item.name.toLowerCase();
    if (opts.avoidIngredients.some((a) => blob.includes(a.toLowerCase()))) return null;
  }

  const emo = emotionScore(r.cuisine, opts.mood);
  const crave = item
    ? itemMatchesCraving(item.name, item.category, r.cuisine, opts.cravings)
    : emotionScore(r.cuisine, opts.mood);
  const rating = ratingScore(Number(r.rating || 4.5));
  const delivery = deliveryScore(Number(r.delivery_time_min || 30), opts.wantsFast);
  const pop = popularityScore(opts.orderCount || 0, opts.maxOrders || 1);
  const health = item ? healthScore(item.name, item.category, opts.wantsHealthy) : 0.5;
  const promo = 0.5;
  const distance = 0.75;

  let favBoost = 0;
  if (opts.favoriteCuisines?.some((f) => r.cuisine.toLowerCase().includes(f.toLowerCase()))) {
    favBoost = 0.1;
  }

  const raw =
    emo * SCORE_WEIGHTS.emotion +
    crave * SCORE_WEIGHTS.craving +
    rating * SCORE_WEIGHTS.rating +
    distance * SCORE_WEIGHTS.distance +
    delivery * SCORE_WEIGHTS.deliveryTime +
    pop * SCORE_WEIGHTS.popularity +
    health * SCORE_WEIGHTS.health +
    promo * SCORE_WEIGHTS.promotions +
    favBoost;

  const price = item ? Number(item.price) : 15;
  const budget = budgetScore(price, opts.budgetMax);
  const adjusted = raw * 0.9 + budget * 0.1;
  const match_score = Math.round(Math.min(99, Math.max(55, adjusted * 100)) * 100) / 100;

  const why_meal = item
    ? `${item.name} ($${Number(item.price).toFixed(2)}) fits your ${opts.mood || "current"} vibe`
    : `${r.name}'s ${r.cuisine || "menu"} is a strong match`;

  const why_restaurant = `${r.name} is rated ${Number(r.rating || 4.5).toFixed(1)}★ with ~${r.delivery_time_min || 30} min delivery`;
  const why_now = `It's ${opts.ctx.timeLabel} on a ${opts.ctx.isWeekend ? "weekend" : "weekday"} — perfect timing for ${r.cuisine || "this"}`;

  const whyParts: string[] = [];
  if (opts.mood) whyParts.push(`you're feeling ${opts.mood.replace(/_/g, " ")}`);
  if (opts.cravings.length) whyParts.push(`you asked for ${opts.cravings.slice(0, 2).join(" & ")}`);
  if (opts.budgetMax) whyParts.push(`under $${opts.budgetMax}`);
  const why = whyParts.length
    ? `I picked this because ${whyParts.join(", ")}. ${why_meal} and ${why_restaurant.toLowerCase()}.`
    : `${why_meal}. ${why_restaurant}.`;

  return {
    restaurant_id: r.restaurant_id,
    restaurant_name: r.name,
    cuisine: r.cuisine || "",
    image_url: r.image_url || "",
    rating: Number(r.rating || 4.5),
    delivery_time_min: Number(r.delivery_time_min || 30),
    menu_item_id: item?.item_id || null,
    menu_item_name: item?.name || null,
    menu_item_price: item ? Number(item.price) : null,
    match_score,
    match_label: matchLabel(match_score),
    score_breakdown: {
      emotion: Math.round(emo * 100),
      craving: Math.round(crave * 100),
      rating: Math.round(rating * 100),
      delivery: Math.round(delivery * 100),
      popularity: Math.round(pop * 100),
      health: Math.round(health * 100),
    },
    why,
    why_now,
    why_restaurant,
    why_meal,
    satisfaction_score: Math.round(match_score * 0.95),
  };
}

export async function loadRestaurantData(db: SupabaseClient) {
  const { data: restaurants } = await db
    .from("restaurants")
    .select("restaurant_id,name,cuisine,rating,delivery_time_min,image_url,description,accepting_orders")
    .eq("approved", true)
    .not("name", "ilike", "TEST_%")
    .order("rating", { ascending: false })
    .limit(50);

  const publicRestaurants = filterPublicRestaurants(restaurants);
  const ids = publicRestaurants.map((r) => r.restaurant_id);
  const { data: menuItems } = ids.length
    ? await db.from("menu_items").select("item_id,restaurant_id,name,price,category,available").in("restaurant_id", ids).eq("available", true)
    : { data: [] };

  const { data: orderCounts } = await db
    .from("orders")
    .select("restaurant_id")
    .eq("payment_status", "paid")
    .limit(500);

  const countMap = new Map<string, number>();
  for (const o of orderCounts || []) {
    const id = o.restaurant_id as string;
    countMap.set(id, (countMap.get(id) || 0) + 1);
  }
  const maxOrders = Math.max(1, ...countMap.values());

  return {
    restaurants: publicRestaurants as RestaurantRow[],
    menuItems: (menuItems || []) as MenuRow[],
    orderCounts: countMap,
    maxOrders,
  };
}

export function rankRecommendations(
  restaurants: RestaurantRow[],
  menuItems: MenuRow[],
  opts: {
    mood: Mood | null;
    cravings: string[];
    ctx: DreamlandContext;
    orderCounts: Map<string, number>;
    maxOrders: number;
    budgetMax?: number | null;
    wantsHealthy?: boolean;
    wantsFast?: boolean;
    favoriteCuisines?: string[];
    avoidIngredients?: string[];
    limit?: number;
  }
): ScoredRecommendation[] {
  const byRest = new Map<string, MenuRow[]>();
  for (const item of menuItems) {
    const list = byRest.get(item.restaurant_id) || [];
    list.push(item);
    byRest.set(item.restaurant_id, list);
  }

  const scored: ScoredRecommendation[] = [];
  for (const r of restaurants) {
    const items = byRest.get(r.restaurant_id) || [];
    const topItems = items.slice(0, 3);
    const candidates = topItems.length ? topItems : [null];
    for (const item of candidates) {
      const rec = scoreRestaurantItem({
        restaurant: r,
        item,
        mood: opts.mood,
        cravings: opts.cravings,
        ctx: opts.ctx,
        orderCount: opts.orderCounts.get(r.restaurant_id),
        maxOrders: opts.maxOrders,
        budgetMax: opts.budgetMax,
        wantsHealthy: opts.wantsHealthy,
        wantsFast: opts.wantsFast,
        favoriteCuisines: opts.favoriteCuisines,
        avoidIngredients: opts.avoidIngredients,
      });
      if (rec) scored.push(rec);
    }
  }

  return scored
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, opts.limit || 12);
}
