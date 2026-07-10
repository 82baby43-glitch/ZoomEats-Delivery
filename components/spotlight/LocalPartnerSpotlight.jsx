"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api, safeGet } from "@/lib/api";
import { SPOTLIGHT_FILTER_LABELS } from "@/lib/spotlight/types";
import SpotlightCard from "./SpotlightCard";

const FILTERS = Object.entries(SPOTLIGHT_FILTER_LABELS);

export default function LocalPartnerSpotlight({ tag = "", showFilters = true, limit = 6 }) {
  const [spotlights, setSpotlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState(tag);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: String(limit), homepage: "1" };
      if (activeTag) params.tag = activeTag;
      const data = await safeGet("/spotlight/featured", { spotlights: [] }, { params });
      const list = Array.isArray(data?.spotlights) ? data.spotlights : Array.isArray(data) ? data : [];
      setSpotlights(list);
    } finally {
      setLoading(false);
    }
  }, [activeTag, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const trackView = async (spotlight) => {
    if (!spotlight?.id) return;
    try {
      await api.post("/spotlight/analytics", {
        event_type: "spotlight_view",
        spotlight_id: spotlight.id,
        restaurant_id: spotlight.restaurant_id,
      });
    } catch {
      /* non-blocking */
    }
  };

  if (!loading && spotlights.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 pb-16" data-testid="local-partner-spotlight">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="label-eyebrow">Local Partner Spotlight</div>
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tight mt-1">
            Support Local Columbia Businesses
          </h2>
          <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
            ZoomEats connects you with the local businesses that make your city unique.
          </p>
        </div>
        <Link href="/local-partners" className="btn-secondary text-sm">
          View all partners
        </Link>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            className={`badge ${!activeTag ? "ring-2 ring-[var(--primary)]" : ""}`}
            onClick={() => setActiveTag("")}
          >
            Featured
          </button>
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`badge ${activeTag === id ? "ring-2 ring-[var(--primary)]" : ""}`}
              onClick={() => setActiveTag(activeTag === id ? "" : id)}
              data-testid={`spotlight-filter-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="card h-80 animate-pulse" style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {spotlights.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <SpotlightCard spotlight={s} featured={i === 0} onView={trackView} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
