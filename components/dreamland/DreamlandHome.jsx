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

export default function DreamlandHome({
  compact = false,
  onAfterMood,
  onAfterSurprise,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/dreamland/home");
      setData(res?.data || null);
    } catch (e) {
      console.warn("[dreamland] home load failed:", e);
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
      <div className={`text-center text-xs py-3 ${compact ? "" : "py-8"}`} style={{ color: "var(--muted)" }}>
        Dreamland is thinking…
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3 pb-2 border-b mb-2" style={{ borderColor: "var(--border)" }}>
        {data?.last_win && <MoodQuickReorder lastWin={data.last_win} compact />}

        <div>
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
          <div className="space-y-2">
            <p className="text-xs font-bold">Perfect for {data.timeLabel || "right now"}</p>
            {data.top_picks.slice(0, 2).map((rec) => (
              <DreamlandRecCard key={`${rec.restaurant_id}-${rec.menu_item_id}`} rec={rec} compact />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10 mb-12">
      <div
        className="rounded-3xl p-6 md:p-8 border overflow-hidden relative"
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(249,168,212,0.08) 50%, rgba(252,211,77,0.06) 100%)",
        }}
      >
        <div className="relative z-10">
          <div className="label-eyebrow">Dreamland AI</div>
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tight mt-1">
            {data?.greeting || "Good evening"} — what should you eat right now?
          </h2>
          <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--muted)" }}>
            I got you. Tell me how you&apos;re feeling, or tap a mood below.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            {MOOD_CHIPS.map((m) => (
              <button
                key={m.id}
                type="button"
                className="px-3 py-1.5 rounded-full text-sm font-bold border transition hover:scale-105"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                onClick={() => setMood(m.id, m.label)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary mt-5 text-sm"
            onClick={surprise}
          >
            ✨ Surprise Me
          </button>
        </div>
      </div>

      {data?.last_win && <MoodQuickReorder lastWin={data.last_win} />}

      {data?.top_picks?.length > 0 && (
        <section>
          <h3 className="font-display text-xl font-bold mb-4">Perfect for {data.timeLabel || "right now"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.top_picks.slice(0, 3).map((rec) => (
              <DreamlandRecCard key={`${rec.restaurant_id}-${rec.menu_item_id}`} rec={rec} compact />
            ))}
          </div>
        </section>
      )}

      {(data?.sections || []).slice(1).map((section) => (
        <section key={section.id}>
          <div className="mb-4">
            <h3 className="font-display text-xl font-bold">{section.title}</h3>
            {section.subtitle && (
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{section.subtitle}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {section.items.slice(0, 3).map((rec) => (
              <DreamlandRecCard key={`${section.id}-${rec.restaurant_id}`} rec={rec} compact />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
