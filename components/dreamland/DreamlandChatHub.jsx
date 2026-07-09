"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import DreamlandRecCard from "./DreamlandRecCard";
import MoodQuickReorder from "./MoodQuickReorder";

const MOOD_CHIPS = [
  { id: "tired", label: "Tired 😴" },
  { id: "stressed", label: "Stressed 😮‍💨" },
  { id: "comfort_food", label: "Comfort 🫶" },
  { id: "healthy_day", label: "Healthy 🥗" },
  { id: "celebrating", label: "Celebrating 🎉" },
  { id: "lazy", label: "Lazy 🛋️" },
];

/**
 * In-chat Dreamland hub — mood reorder, mood chips, surprise, top picks.
 * Rendered only inside the Dreamland chat panel (not on landing pages).
 */
export default function DreamlandChatHub({ onAfterMood, onAfterSurprise }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/dreamland/home");
      setData(res?.data || null);
    } catch (e) {
      console.warn("[dreamland] hub load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setMood = async (mood, label) => {
    try {
      await api.post("/dreamland/mood", { mood });
      await load();
      onAfterMood?.(mood, label);
    } catch (e) {
      console.warn(e);
    }
  };

  const surprise = async () => {
    try {
      const res = await api.post("/dreamland/surprise", {});
      if (res?.data) {
        await load();
        onAfterSurprise?.(res.data);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-xs py-3" style={{ color: "var(--muted)" }} data-testid="dreamland-chat-hub-loading">
        Dreamland is thinking…
      </div>
    );
  }

  return (
    <div
      className="space-y-3 pb-3 border-b mb-1"
      style={{ borderColor: "var(--border)" }}
      data-testid="dreamland-chat-hub"
    >
      <div className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {data?.greeting ? `${data.greeting} — ` : ""}
        Tell me how you&apos;re feeling, or pick a shortcut below.
      </div>

      {data?.last_win && (
        <div data-testid="dreamland-hub-quick-reorder">
          <MoodQuickReorder lastWin={data.last_win} compact />
        </div>
      )}

      <div data-testid="dreamland-hub-mood-chips">
        <p className="text-xs font-bold mb-2">How are you feeling?</p>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_CHIPS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="px-2.5 py-1 rounded-full text-xs font-bold border transition hover:scale-105"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              onClick={() => setMood(m.id, m.label)}
              data-testid={`dreamland-mood-${m.id}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-primary w-full text-xs py-2"
        onClick={surprise}
        data-testid="dreamland-surprise-button"
      >
        ✨ Surprise Me
      </button>

      {data?.top_picks?.length > 0 && (
        <div className="space-y-2" data-testid="dreamland-hub-top-picks">
          <p className="text-xs font-bold">Top picks for {data.timeLabel || "right now"}</p>
          {data.top_picks.slice(0, 2).map((rec) => (
            <DreamlandRecCard key={`${rec.restaurant_id}-${rec.menu_item_id}`} rec={rec} compact />
          ))}
        </div>
      )}
    </div>
  );
}
