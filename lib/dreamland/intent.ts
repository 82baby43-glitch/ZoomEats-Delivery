export type DreamlandIntent = "greeting" | "thanks" | "conversation" | "food" | "general";

const GREETING_RE = /^(hi|hello|hey|yo|sup|hiya|good morning|good afternoon|good evening|good night|howdy|what's up|whats up|gm|gn)[\s!.,?]*$/i;
const THANKS_RE = /^(thanks|thank you|thx|ty|appreciate it|awesome|perfect|great)[\s!.,?]*$/i;
const CONVERSATION_RE = /^(how are you|who are you|what are you|what can you do|help|tell me about yourself|are you there)[\s?.!]*$/i;
const FOOD_RE = /hungry|eat|food|craving|mood|order|restaurant|recommend|menu|dinner|lunch|breakfast|snack|taco|pizza|sushi|burger|ramen|surprise me|what should i eat|what to eat|feeling|stressed|tired|comfort|healthy|indulgent|delivery|pick up|under \$|budget|long day|don't want to think|pick for me/i;

export function classifyIntent(text: string): DreamlandIntent {
  const t = text.trim();
  if (!t) return "general";
  if (GREETING_RE.test(t)) return "greeting";
  if (THANKS_RE.test(t)) return "thanks";
  if (CONVERSATION_RE.test(t)) return "conversation";
  if (FOOD_RE.test(t)) return "food";
  return "general";
}

export function shouldRecommend(intent: DreamlandIntent, text: string): boolean {
  if (intent === "food") return true;
  if (intent === "greeting" || intent === "thanks" || intent === "conversation") return false;
  return FOOD_RE.test(text);
}

export function conversationalFallback(intent: DreamlandIntent, userName?: string): string {
  const name = userName ? ` ${userName}` : "";
  if (intent === "greeting") {
    return `Hey${name}! Good to see you. I'm Dreamland — your food brain on ZoomEats. How's your day going? Whenever you're ready to figure out what to eat, just tell me how you're feeling or what you're craving.`;
  }
  if (intent === "thanks") {
    return "Anytime — that's what I'm here for. If you need another pick later, just holler.";
  }
  if (intent === "conversation") {
    return "I'm Dreamland — I help you figure out what to eat on ZoomEats. Tell me your mood, a craving, your budget, or say \"surprise me\" and I'll find something that actually fits. What's on your mind?";
  }
  return "I'm here! Tell me how you're feeling or what sounds good — I'll help you find the right meal.";
}
