export const MOODS = [
  "happy", "sad", "stressed", "depressed", "excited", "celebrating", "lonely",
  "tired", "heartbroken", "hungover", "lazy", "working", "studying", "gym_recovery",
  "date_night", "movie_night", "family_dinner", "late_night", "sick", "comfort_food",
  "healthy_day", "cheat_meal", "road_trip", "rainy_day", "cold_outside", "hot_outside",
] as const;

export type Mood = (typeof MOODS)[number];

const MOOD_KEYWORDS: Record<string, Mood> = {
  happy: "happy", joy: "happy", great: "happy", amazing: "happy",
  sad: "sad", down: "sad", blue: "sad", crying: "sad",
  stressed: "stressed", stress: "stressed", anxious: "stressed", overwhelmed: "stressed",
  depressed: "depressed", depression: "depressed",
  excited: "excited", pumped: "excited", hyped: "excited",
  celebrating: "celebrating", celebrate: "celebrating", birthday: "celebrating", anniversary: "celebrating",
  lonely: "lonely", alone: "lonely",
  tired: "tired", exhausted: "tired", sleepy: "tired", drained: "tired",
  heartbroken: "heartbroken", breakup: "heartbroken", dumped: "heartbroken",
  hungover: "hungover", hangover: "hungover",
  lazy: "lazy", "don't want to cook": "lazy", couch: "lazy",
  working: "working", work: "working", office: "working", wfh: "working",
  studying: "studying", study: "studying", exam: "studying", homework: "studying",
  gym: "gym_recovery", workout: "gym_recovery", protein: "gym_recovery", fitness: "gym_recovery",
  date: "date_night", romantic: "date_night", anniversary_dinner: "date_night",
  movie: "movie_night", netflix: "movie_night", binge: "movie_night",
  family: "family_dinner", kids: "family_dinner",
  "late night": "late_night", midnight: "late_night", "2am": "late_night",
  sick: "sick", flu: "sick", "under the weather": "sick",
  comfort: "comfort_food", comforting: "comfort_food", cozy: "comfort_food",
  healthy: "healthy_day", salad: "healthy_day", light: "healthy_day",
  cheat: "cheat_meal", indulgent: "cheat_meal", treat: "cheat_meal",
  "road trip": "road_trip", driving: "road_trip",
  rainy: "rainy_day", rain: "rainy_day",
  cold: "cold_outside", freezing: "cold_outside", winter: "cold_outside",
  hot: "hot_outside", summer: "hot_outside", heat: "hot_outside",
  "just got paid": "celebrating", payday: "celebrating",
  "long day": "tired",
};

const MOOD_CUISINES: Record<Mood, string[]> = {
  happy: ["Mexican", "Thai", "Japanese", "American"],
  sad: ["Italian", "American", "Comfort", "Chinese"],
  stressed: ["Japanese", "Thai", "Mediterranean", "Soup"],
  depressed: ["American", "Italian", "Comfort", "Burgers"],
  excited: ["Korean", "Mexican", "BBQ", "Seafood"],
  celebrating: ["Steakhouse", "Seafood", "Japanese", "Fine Dining"],
  lonely: ["Pizza", "Chinese", "Comfort", "Ramen"],
  tired: ["Soup", "Ramen", "Pho", "American"],
  heartbroken: ["Ice Cream", "Comfort", "Pizza", "Chocolate"],
  hungover: ["American", "Mexican", "Burgers", "Breakfast"],
  lazy: ["Pizza", "Chinese", "American", "Fast Food"],
  working: ["Sandwich", "Salad", "Mediterranean", "Healthy"],
  studying: ["Coffee", "Pizza", "Sandwich", "Asian"],
  gym_recovery: ["Healthy", "Protein", "Mediterranean", "Salad"],
  date_night: ["Italian", "French", "Japanese", "Seafood"],
  movie_night: ["Pizza", "Wings", "Mexican", "American"],
  family_dinner: ["Italian", "American", "Mexican", "Chinese"],
  late_night: ["Tacos", "Pizza", "Wings", "Burgers"],
  sick: ["Soup", "Pho", "Ramen", "Tea"],
  comfort_food: ["Mac and Cheese", "Burgers", "Ramen", "Fried Chicken"],
  healthy_day: ["Salad", "Mediterranean", "Healthy", "Vegan"],
  cheat_meal: ["Burgers", "BBQ", "Fried Chicken", "Dessert"],
  road_trip: ["Sandwich", "Burgers", "Mexican", "American"],
  rainy_day: ["Soup", "Ramen", "Curry", "Comfort"],
  cold_outside: ["Soup", "Hot Pot", "Ramen", "Stew"],
  hot_outside: ["Salad", "Smoothie", "Vietnamese", "Light"],
};

const MOOD_PHRASES: Record<Mood, string> = {
  happy: "You've got good energy — let's match it with something vibrant.",
  sad: "I got you. Let's find something that'll hit the spot.",
  stressed: "You've had a long day. Comfort is the move.",
  depressed: "No judgment here. Let's find something gentle and satisfying.",
  excited: "Love the energy! Let's find something worth celebrating.",
  celebrating: "You deserve something special tonight.",
  lonely: "Food that feels like a hug — coming right up.",
  tired: "Low effort, high reward. I know exactly what you need.",
  heartbroken: "Let's be kind to yourself tonight.",
  hungover: "Greasy, salty, restorative — I've got ideas.",
  lazy: "Zero effort required on your end. I'll handle this.",
  working: "Fuel that won't slow you down.",
  studying: "Brain fuel that actually tastes good.",
  gym_recovery: "Protein-packed and delicious — recovery mode.",
  date_night: "Something impressive without being try-hard.",
  movie_night: "Perfect finger food for the couch.",
  family_dinner: "Something everyone will actually eat.",
  late_night: "The best kitchens are still open.",
  sick: "Warm, soothing, easy on the stomach.",
  comfort_food: "Maximum comfort, minimum thinking.",
  healthy_day: "Fresh, nourishing, still delicious.",
  cheat_meal: "You earned this. No regrets.",
  road_trip: "Easy to eat, hard to regret.",
  rainy_day: "Cozy weather calls for cozy food.",
  cold_outside: "Something warm to thaw you out.",
  hot_outside: "Light, fresh, and cooling.",
};

export function detectMood(text: string): Mood | null {
  const lower = text.toLowerCase();
  for (const [keyword, mood] of Object.entries(MOOD_KEYWORDS)) {
    if (lower.includes(keyword)) return mood;
  }
  return null;
}

export function moodCuisines(mood: Mood | null): string[] {
  if (!mood) return [];
  return MOOD_CUISINES[mood] || [];
}

export function moodPhrase(mood: Mood | null): string {
  if (!mood) return "What should we eat right now?";
  return MOOD_PHRASES[mood];
}

export function matchLabel(score: number): string {
  if (score >= 95) return "Perfect Match";
  if (score >= 88) return "Great Match";
  if (score >= 80) return "Good Match";
  if (score >= 70) return "Solid Pick";
  return "Worth a Try";
}
