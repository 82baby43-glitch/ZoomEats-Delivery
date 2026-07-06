"use client";

import Link from "next/link";
import { Star, Clock } from "lucide-react";
import { formatMoney } from "@/lib/safeData";

function scoreColor(score) {
  if (score >= 95) return "#a78bfa";
  if (score >= 88) return "#34d399";
  if (score >= 80) return "#fbbf24";
  return "var(--muted)";
}

export default function DreamlandRecCard({ rec, compact = false }) {
  if (!rec) return null;
  return (
    <Link
      href={`/r/${rec.restaurant_id}`}
      className="card card-hover block overflow-hidden"
      style={{ background: "linear-gradient(180deg, var(--surface) 0%, rgba(167,139,250,0.04) 100%)" }}
    >
      {rec.image_url && !compact && (
        <div className="aspect-video overflow-hidden">
          <img src={rec.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-bold">{rec.restaurant_name}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {rec.menu_item_name || rec.cuisine} {rec.menu_item_price != null && `· $${formatMoney(rec.menu_item_price)}`}
            </div>
          </div>
          <div
            className="text-xs font-black px-2 py-1 rounded-lg shrink-0"
            style={{ background: "rgba(167,139,250,0.15)", color: scoreColor(rec.match_score) }}
          >
            {rec.match_score}%
          </div>
        </div>
        {!compact && rec.why && (
          <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
            {rec.why}
          </p>
        )}
        <div className="flex gap-2 mt-2 text-xs" style={{ color: "var(--muted)" }}>
          <span className="badge"><Star size={12} /> {rec.rating?.toFixed?.(1) ?? rec.rating}</span>
          <span className="badge"><Clock size={12} /> {rec.delivery_time_min} min</span>
          <span className="badge">{rec.match_label}</span>
        </div>
      </div>
    </Link>
  );
}
