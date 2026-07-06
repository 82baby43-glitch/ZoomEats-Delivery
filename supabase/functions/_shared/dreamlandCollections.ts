import type { ScoredRecommendation } from "./dreamlandScoring.ts";
import type { DreamlandContext } from "./dreamlandContext.ts";

export type DreamlandCollection = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  items: ScoredRecommendation[];
};

export function buildCollections(
  all: ScoredRecommendation[],
  ctx: DreamlandContext
): DreamlandCollection[] {
  const collections: DreamlandCollection[] = [];

  const comfort = all.filter((r) =>
    /ramen|soup|mac|burger|pizza|comfort|fried/i.test(`${r.cuisine} ${r.menu_item_name || ""}`)
  ).slice(0, 4);
  if (comfort.length) {
    collections.push({
      id: "comfort",
      title: "Best Comfort Foods",
      subtitle: "Warm, satisfying, zero judgment",
      emoji: "🫶",
      items: comfort,
    });
  }

  const protein = all.filter((r) =>
    /bowl|grilled|chicken|steak|protein|salmon/i.test(`${r.menu_item_name || ""} ${r.cuisine}`)
  ).slice(0, 4);
  if (protein.length) {
    collections.push({
      id: "protein",
      title: "High Protein",
      subtitle: "Gym recovery & fuel",
      emoji: "💪",
      items: protein,
    });
  }

  const quick = all.filter((r) => r.delivery_time_min <= 25).slice(0, 4);
  if (quick.length) {
    collections.push({
      id: "quick",
      title: "Quick Under 25 Minutes",
      subtitle: "Fast without sacrificing taste",
      emoji: "⚡",
      items: quick,
    });
  }

  const budget = all.filter((r) => (r.menu_item_price || 20) <= 12).slice(0, 4);
  if (budget.length) {
    collections.push({
      id: "budget",
      title: "Under $12",
      subtitle: "Big flavor, small bill",
      emoji: "💸",
      items: budget,
    });
  }

  const healthy = all.filter((r) =>
    /salad|bowl|poke|veggie|mediterranean/i.test(`${r.menu_item_name || ""} ${r.cuisine}`)
  ).slice(0, 4);
  if (healthy.length) {
    collections.push({
      id: "healthy",
      title: "Healthy Picks",
      subtitle: "Fresh & nourishing",
      emoji: "🥗",
      items: healthy,
    });
  }

  const lateNight = ctx.isLateNight
    ? all.filter((r) => /taco|pizza|wings|burger/i.test(`${r.menu_item_name || ""}`)).slice(0, 4)
    : [];
  if (lateNight.length) {
    collections.push({
      id: "late_night",
      title: "Late Night",
      subtitle: "Kitchens still open",
      emoji: "🌙",
      items: lateNight,
    });
  }

  const trending = [...all].sort((a, b) => b.rating - a.rating).slice(0, 4);
  collections.push({
    id: "trending",
    title: "Trending Today",
    subtitle: "Highest rated near you",
    emoji: "🔥",
    items: trending,
  });

  const dateNight = all.filter((r) =>
    /italian|japanese|seafood|french|steak/i.test(r.cuisine)
  ).slice(0, 4);
  if (dateNight.length) {
    collections.push({
      id: "date_night",
      title: "Best Date Night",
      subtitle: "Impressive without trying too hard",
      emoji: "✨",
      items: dateNight,
    });
  }

  if (ctx.weather === "rain" || ctx.timeLabel === "dinner") {
    const rainy = all.filter((r) =>
      /soup|ramen|curry|pho/i.test(`${r.menu_item_name || ""} ${r.cuisine}`)
    ).slice(0, 4);
    if (rainy.length) {
      collections.push({
        id: "rainy",
        title: "Rainy Day Favorites",
        subtitle: "Cozy weather calls for cozy food",
        emoji: "🌧️",
        items: rainy,
      });
    }
  }

  return collections.slice(0, 8);
}

export type HomeSection = {
  id: string;
  title: string;
  subtitle?: string;
  type: "mood_picks" | "collection" | "restaurants";
  items: ScoredRecommendation[];
};

export function buildHomeSections(
  all: ScoredRecommendation[],
  ctx: DreamlandContext,
  collections: DreamlandCollection[]
): HomeSection[] {
  const sections: HomeSection[] = [
    {
      id: "greeting",
      title: `${ctx.greeting} ☀️`,
      subtitle: "Feeling hungry? Dreamland's got you.",
      type: "mood_picks",
      items: all.slice(0, 3),
    },
    {
      id: "comfort",
      title: "Need comfort food?",
      subtitle: "I got you.",
      type: "mood_picks",
      items: all.filter((r) => /comfort|ramen|soup|burger/i.test(`${r.cuisine} ${r.menu_item_name}`)).slice(0, 3),
    },
    {
      id: "energy",
      title: "Need energy?",
      subtitle: "Fuel up fast",
      type: "mood_picks",
      items: all.filter((r) => r.delivery_time_min <= 25).slice(0, 3),
    },
  ];

  for (const col of collections.slice(0, 5)) {
    sections.push({
      id: col.id,
      title: col.title,
      subtitle: col.subtitle,
      type: "collection",
      items: col.items,
    });
  }

  return sections.filter((s) => s.items.length > 0);
}
