import type { Mood } from "./emotions";

export type DreamlandContext = {
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isLateNight: boolean;
  isLunch: boolean;
  isDinner: boolean;
  isBreakfast: boolean;
  greeting: string;
  timeLabel: string;
  weather?: string;
};

export function buildContext(now = new Date(), weather?: string): DreamlandContext {
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isLateNight = hour >= 22 || hour < 5;
  const isBreakfast = hour >= 5 && hour < 11;
  const isLunch = hour >= 11 && hour < 15;
  const isDinner = hour >= 17 && hour < 22;

  let greeting = "Good evening";
  if (hour >= 5 && hour < 12) greeting = "Good morning";
  else if (hour >= 12 && hour < 17) greeting = "Good afternoon";
  else if (isLateNight) greeting = "Late night cravings";

  let timeLabel = "dinner";
  if (isBreakfast) timeLabel = "breakfast";
  else if (isLunch) timeLabel = "lunch";
  else if (isLateNight) timeLabel = "late night";

  return {
    hour,
    dayOfWeek,
    isWeekend,
    isLateNight,
    isLunch,
    isDinner,
    isBreakfast,
    greeting,
    timeLabel,
    weather,
  };
}

export function inferMoodFromContext(ctx: DreamlandContext): Mood | null {
  if (ctx.isLateNight) return "late_night";
  if (ctx.weather === "rain") return "rainy_day";
  if (ctx.weather === "cold") return "cold_outside";
  if (ctx.weather === "hot") return "hot_outside";
  if (ctx.isWeekend && ctx.isDinner) return "celebrating";
  if (!ctx.isWeekend && ctx.isLunch) return "working";
  return null;
}
