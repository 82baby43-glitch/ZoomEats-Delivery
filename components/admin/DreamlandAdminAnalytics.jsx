"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { LoadingSkeleton } from "@/components/ui/PageStates";

export default function DreamlandAdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/dreamland/admin/analytics");
        setData(r?.data || null);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen pb-16">
      <Header />
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold">Dreamland AI Analytics</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              AI conversations, moods, recommendations, and conversion (last {data?.period_days || 30} days).
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
        </div>

        {loading ? (
          <LoadingSkeleton label="Loading Dreamland analytics…" rows={4} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ["Conversations", data?.conversations],
                ["Recommendations", data?.recommendations_shown],
                ["Dreamland orders", data?.orders_from_dreamland],
                ["Conversion", `${data?.conversion_rate_pct ?? 0}%`],
                ["Satisfaction", data?.satisfaction_avg ?? "—"],
                ["Refresh usage", data?.refresh_usage],
                ["Saves", data?.saves],
              ].map(([label, val]) => (
                <div key={label} className="card p-4 text-center">
                  <div className="text-2xl font-black">{val}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
                </div>
              ))}
            </div>

            <div className="card p-5">
              <h2 className="font-display font-bold mb-3">Mood selections</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data?.mood_selections || {}).map(([mood, count]) => (
                  <span key={mood} className="badge">{mood.replace(/_/g, " ")} · {count}</span>
                ))}
                {!Object.keys(data?.mood_selections || {}).length && (
                  <span className="text-sm" style={{ color: "var(--muted)" }}>No mood data yet.</span>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-display font-bold mb-3">Top recommendations</h2>
              <div className="space-y-2 text-sm">
                {(data?.top_recommendations || []).map((rec) => (
                  <div key={`${rec.restaurant_id}-${rec.match_score}`} className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--border)" }}>
                    <span>{rec.why?.slice(0, 80) || rec.restaurant_id}</span>
                    <span className="font-bold shrink-0">{rec.match_score}%</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
