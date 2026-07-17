import type { Mood } from "./emotions";
import { detectMood } from "./emotions";
import { detectCravings } from "./cravings";
import { classifyIntent } from "./intent";

export type EmotionalAnalysis = {
  emotion: Mood | null;
  intent: ReturnType<typeof classifyIntent>;
  decisionFatigue: "low" | "medium" | "high";
  discoveryMode: boolean;
  budgetMentioned: boolean;
  timeSensitive: boolean;
  responseStyle: "supportive" | "simple" | "discovery" | "balanced" | "friendly";
  recommendLimit: number;
  summary: string;
};

const DECISION_FATIGUE_RE =
  /don't want to think|can't decide|too many choices|decision fatigue|just pick|you choose|no energy to decide|long day/i;
const SURPRISE_RE = /surprise me|pick for me|anything|whatever|don't care/i;
const BUDGET_RE = /under \$|budget|cheap|affordable|value|less than \$/i;
const TIME_RE = /fast|quick|asap|hurry|rush|soon|now/i;

export function analyzeMessage(text: string, moodOverride?: Mood | null): EmotionalAnalysis {
  const intent = classifyIntent(text);
  const emotion = moodOverride || detectMood(text);
  const cravings = detectCravings(text);
  const lower = text.toLowerCase();

  const decisionFatigue: EmotionalAnalysis["decisionFatigue"] =
    DECISION_FATIGUE_RE.test(text) || /tired|exhausted|drained/.test(lower)
      ? "high"
      : /maybe|not sure|hmm|idk/.test(lower)
        ? "medium"
        : "low";

  const discoveryMode = SURPRISE_RE.test(text) || intent === "food" && cravings.length === 0 && !emotion;

  let responseStyle: EmotionalAnalysis["responseStyle"] = "friendly";
  if (/stressed|overwhelmed|rough day|hard day/.test(lower)) responseStyle = "supportive";
  else if (decisionFatigue === "high") responseStyle = "simple";
  else if (discoveryMode) responseStyle = "discovery";

  const recommendLimit = decisionFatigue === "high" ? 3 : discoveryMode ? 4 : 5;

  const parts: string[] = [];
  if (emotion) parts.push(`emotion=${emotion.replace(/_/g, " ")}`);
  if (decisionFatigue !== "low") parts.push(`decision=${decisionFatigue}`);
  if (discoveryMode) parts.push("mode=discovery");
  if (cravings.length) parts.push(`craving=${cravings.slice(0, 2).join(",")}`);

  return {
    emotion,
    intent,
    decisionFatigue,
    discoveryMode,
    budgetMentioned: BUDGET_RE.test(text),
    timeSensitive: TIME_RE.test(text),
    responseStyle,
    recommendLimit,
    summary: parts.join("; ") || "general food discovery",
  };
}
