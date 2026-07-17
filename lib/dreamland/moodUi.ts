import type { Mood } from "./emotions";

/** v2.0 mood chips shown in Dreamland UI */
export const MOOD_UI_CHIPS = [
  { id: "feeling_good", label: "😊 Feeling Good", mood: "happy" as Mood },
  { id: "stress_relief", label: "😩 Stress Relief", mood: "stressed" as Mood },
  { id: "low_energy", label: "😴 Low Energy", mood: "tired" as Mood },
  { id: "strong_craving", label: "🔥 Strong Craving", mood: "cheat_meal" as Mood },
  { id: "healthy_choice", label: "🥗 Healthy Choice", mood: "healthy_day" as Mood },
  { id: "budget_mode", label: "💰 Budget Mode", mood: "lazy" as Mood },
  { id: "celebration", label: "🎉 Celebration", mood: "celebrating" as Mood },
] as const;

export type MoodUiId = (typeof MOOD_UI_CHIPS)[number]["id"];

export function resolveUiMood(id: string): Mood | null {
  const chip = MOOD_UI_CHIPS.find((m) => m.id === id || m.mood === id);
  return chip?.mood ?? null;
}

export type MoodModeRules = {
  wantsHealthy?: boolean;
  wantsFast?: boolean;
  budgetBias?: number;
  limitChoices?: number;
  responseStyle: string;
};

export function moodModeRules(mood: Mood | null, uiId?: string): MoodModeRules {
  const id = uiId || MOOD_UI_CHIPS.find((c) => c.mood === mood)?.id;
  switch (id) {
    case "stress_relief":
      return { wantsFast: true, limitChoices: 3, responseStyle: "supportive" };
    case "low_energy":
      return { wantsFast: true, limitChoices: 3, responseStyle: "simple" };
    case "healthy_choice":
      return { wantsHealthy: true, responseStyle: "balanced" };
    case "budget_mode":
      return { budgetBias: 0.85, responseStyle: "value" };
    case "celebration":
      return { limitChoices: 4, responseStyle: "premium" };
    case "strong_craving":
      return { limitChoices: 4, responseStyle: "discovery" };
  }
  return { responseStyle: "friendly" };
}
