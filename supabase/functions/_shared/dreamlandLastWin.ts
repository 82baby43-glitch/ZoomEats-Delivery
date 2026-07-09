import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mood } from "./dreamlandEmotions.ts";
import { moodPhrase } from "./dreamlandEmotions.ts";

export type LastWin = {
  mood: string;
  mood_label: string;
  headline: string;
  subline: string;
  restaurant: {
    restaurant_id: string;
    name: string;
    image_url: string | null;
  };
  item: {
    item_id: string;
    name: string;
    price: number;
    quantity: number;
    image_url: string | null;
  };
  ordered_at: string;
};

const MOOD_LABELS: Record<string, string> = {
  tired: "Tired",
  stressed: "Stressed",
  comfort_food: "Comfort",
  healthy_day: "Healthy",
  celebrating: "Celebrating",
  lazy: "Lazy",
  happy: "Happy",
  sad: "Sad",
  excited: "Excited",
  lonely: "Lonely",
  heartbroken: "Heartbroken",
  hungover: "Hungover",
  working: "Working",
  studying: "Studying",
  gym_recovery: "Gym recovery",
  date_night: "Date night",
  movie_night: "Movie night",
  family_dinner: "Family dinner",
  late_night: "Late night",
  sick: "Sick",
  cheat_meal: "Cheat meal",
  road_trip: "Road trip",
  rainy_day: "Rainy day",
  cold_outside: "Cold outside",
  hot_outside: "Hot outside",
  depressed: "Low energy",
};

const MOOD_REORDER_HEADLINES: Partial<Record<Mood, (itemName: string) => string>> = {
  tired: (item) => `Still feeling tired? Same ${item} hit?`,
  stressed: (item) => `Long day again? Your ${item} worked last time.`,
  comfort_food: (item) => `Need comfort again? Same ${item}.`,
  healthy_day: (item) => `Back on the healthy train? Your ${item} is ready.`,
  celebrating: (item) => `Another win? Celebrate with ${item} again.`,
  lazy: (item) => `Too lazy to browse? Same ${item}, zero thinking.`,
  sad: (item) => `Rough patch? Your ${item} helped before.`,
  lonely: (item) => `Same cozy pick — ${item}.`,
  hungover: (item) => `Morning after? I remember the ${item} cure.`,
  late_night: (item) => `Late night again? ${item} hits the spot.`,
  sick: (item) => `Still under the weather? Same soothing ${item}.`,
  gym_recovery: (item) => `Recovery mode — your ${item} is waiting.`,
  movie_night: (item) => `Movie night part two? Grab ${item} again.`,
  rainy_day: (item) => `Rainy vibes again? Same ${item}.`,
  cold_outside: (item) => `Still cold out? Warm up with ${item}.`,
};

type OrderItem = {
  item_id?: string;
  name?: string;
  price?: number;
  quantity?: number;
  image_url?: string;
};

function isTestRestaurantName(name: string | null | undefined): boolean {
  return /^TEST_/i.test(String(name || "").trim());
}

function moodLabel(mood: string): string {
  return MOOD_LABELS[mood] || mood.replace(/_/g, " ");
}

function buildCopy(mood: Mood, itemName: string) {
  const shortName = itemName.split(" ")[0] || itemName;
  const headlineFn = MOOD_REORDER_HEADLINES[mood];
  const headline = headlineFn ? headlineFn(shortName) : `Same vibe, same meal?`;
  const subline = moodPhrase(mood);
  return { headline, subline };
}

export async function loadLastWin(db: SupabaseClient, userId: string): Promise<LastWin | null> {
  const [{ data: profile }, { data: lastOrder }] = await Promise.all([
    db.from("dreamland_profiles").select("last_mood").eq("user_id", userId).maybeSingle(),
    db
      .from("orders")
      .select("order_id,restaurant_id,restaurant_name,items,created_at")
      .eq("customer_id", userId)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const mood = profile?.last_mood as Mood | null;
  if (!mood || !lastOrder?.restaurant_id) return null;

  const items = (Array.isArray(lastOrder.items) ? lastOrder.items : []) as OrderItem[];
  const firstItem = items.find((it) => it?.item_id && it?.name);
  if (!firstItem?.item_id) return null;

  const { data: rest } = await db
    .from("restaurants")
    .select("restaurant_id,name,image_url,accepting_orders,active,delivery_enabled")
    .eq("restaurant_id", lastOrder.restaurant_id)
    .maybeSingle();

  if (!rest || isTestRestaurantName(rest.name)) return null;
  if (rest.accepting_orders === false || rest.active === false || rest.delivery_enabled === false) return null;

  const { data: menuItem } = await db
    .from("menu_items")
    .select("item_id,name,price,image_url,available")
    .eq("item_id", firstItem.item_id)
    .eq("restaurant_id", lastOrder.restaurant_id)
    .maybeSingle();

  if (!menuItem?.available) return null;

  const { headline, subline } = buildCopy(mood, menuItem.name as string);

  return {
    mood,
    mood_label: moodLabel(mood),
    headline,
    subline,
    restaurant: {
      restaurant_id: rest.restaurant_id as string,
      name: rest.name as string,
      image_url: (rest.image_url as string) || null,
    },
    item: {
      item_id: menuItem.item_id as string,
      name: menuItem.name as string,
      price: Number(menuItem.price),
      quantity: Math.max(1, Number(firstItem.quantity) || 1),
      image_url: (menuItem.image_url as string) || (firstItem.image_url as string) || null,
    },
    ordered_at: lastOrder.created_at as string,
  };
}
