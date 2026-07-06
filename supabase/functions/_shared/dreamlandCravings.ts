export const CRAVING_KEYWORDS: Record<string, string[]> = {
  salty: ["fries", "chips", "ramen", "pizza", "tacos", "wings", "burger"],
  sweet: ["dessert", "ice cream", "donut", "cake", "milkshake", "chocolate", "pastry"],
  crispy: ["fried chicken", "wings", "tempura", "fries", "spring roll", "tacos"],
  cheesy: ["pizza", "mac and cheese", "quesadilla", "grilled cheese", "lasagna"],
  spicy: ["thai", "korean", "mexican", "szechuan", "curry", "wings", "hot"],
  fresh: ["salad", "poke", "sushi", "vietnamese", "mediterranean", "bowl"],
  protein: ["steak", "chicken", "salmon", "bowl", "greek", "grilled"],
  vegetarian: ["salad", "veggie", "falafel", "tofu", "plant"],
  vegan: ["vegan", "plant-based", "tofu", "falafel"],
  seafood: ["sushi", "fish", "shrimp", "crab", "lobster", "poke"],
  breakfast: ["pancake", "egg", "bacon", "bagel", "coffee", "brunch"],
  coffee: ["coffee", "espresso", "latte", "cafe", "pastry"],
  dessert: ["cake", "ice cream", "cookie", "brownie", "cheesecake"],
  milkshake: ["milkshake", "smoothie", "shake"],
  "late night snacks": ["wings", "pizza", "tacos", "burger", "fries"],
  soup: ["pho", "ramen", "soup", "stew", "chowder"],
  noodles: ["ramen", "pho", "pasta", "udon", "pad thai"],
  burger: ["burger", "smash", "cheeseburger"],
  tacos: ["taco", "burrito", "quesadilla", "mexican"],
  sushi: ["sushi", "sashimi", "roll", "japanese"],
};

export function detectCravings(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const craving of Object.keys(CRAVING_KEYWORDS)) {
    if (lower.includes(craving)) found.add(craving);
  }
  return [...found];
}

export function cravingTerms(cravings: string[]): string[] {
  const terms = new Set<string>();
  for (const c of cravings) {
    for (const term of CRAVING_KEYWORDS[c] || []) terms.add(term.toLowerCase());
  }
  return [...terms];
}

export function itemMatchesCraving(
  itemName: string,
  category: string,
  cuisine: string,
  cravings: string[]
): number {
  if (!cravings.length) return 0.5;
  const blob = `${itemName} ${category} ${cuisine}`.toLowerCase();
  const terms = cravingTerms(cravings);
  if (!terms.length) return 0.5;
  let hits = 0;
  for (const term of terms) {
    if (blob.includes(term)) hits += 1;
  }
  return Math.min(1, hits / Math.max(2, terms.length * 0.5));
}
