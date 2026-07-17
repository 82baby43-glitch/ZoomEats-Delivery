"use client";

import Link from "next/link";
import { Star, Clock, ShoppingCart, Heart, RefreshCw, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/safeData";
import { useCart } from "@/lib/cart";
import { dreamlandFeedback } from "@/lib/api";

function scoreColor(score) {
  if (score >= 95) return "#B6F127";
  if (score >= 88) return "#34d399";
  if (score >= 80) return "#fbbf24";
  return "var(--muted)";
}

export default function DreamlandRecCard({ rec, compact = false, onShowMore }) {
  const { addItem } = useCart();
  if (!rec) return null;

  const addToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rec.menu_item_id) return;
    addItem(
      { restaurant_id: rec.restaurant_id, name: rec.restaurant_name },
      {
        item_id: rec.menu_item_id,
        name: rec.menu_item_name || "Item",
        price: rec.menu_item_price || 0,
        image_url: rec.image_url,
      }
    );
    dreamlandFeedback({
      action: "ordered",
      restaurant_id: rec.restaurant_id,
      recommendation_id: rec.recommendation_id,
    }).catch(() => {});
  };

  const savePick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dreamlandFeedback({
      action: "saved",
      restaurant_id: rec.restaurant_id,
      notes: rec.menu_item_name || rec.restaurant_name,
    }).catch(() => {});
  };

  const showMore = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onShowMore?.(rec);
  };

  return (
    <div
      className="card overflow-hidden"
      style={{ background: "linear-gradient(180deg, var(--surface) 0%, rgba(182,241,39,0.04) 100%)" }}
      data-testid="dreamland-pick-card"
    >
      {rec.image_url && !compact && (
        <Link href={`/r/${rec.restaurant_id}`} className="block aspect-video overflow-hidden">
          <img src={rec.image_url} alt="" className="w-full h-full object-cover" />
        </Link>
      )}
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--primary)" }}>
              <Sparkles size={12} /> Dreamland Pick
            </div>
            <Link href={`/r/${rec.restaurant_id}`} className="font-display font-bold hover:underline">
              {rec.restaurant_name}
            </Link>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {rec.menu_item_name || rec.cuisine}
              {rec.menu_item_price != null && ` · $${formatMoney(rec.menu_item_price)}`}
            </div>
          </div>
          <div
            className="text-xs font-black px-2 py-1 rounded-lg shrink-0"
            style={{ background: "rgba(182,241,39,0.12)", color: scoreColor(rec.match_score) }}
          >
            {rec.match_score}% Match
          </div>
        </div>

        {rec.why && (
          <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
            {rec.why}
          </p>
        )}

        <div className="flex gap-2 mt-2 text-xs" style={{ color: "var(--muted)" }}>
          <span className="badge"><Star size={12} /> {rec.rating?.toFixed?.(1) ?? rec.rating}</span>
          <span className="badge"><Clock size={12} /> {rec.delivery_time_min} min</span>
          <span className="badge">{rec.match_label}</span>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {rec.menu_item_id && (
            <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={addToCart} data-testid="dreamland-add-cart">
              <ShoppingCart size={14} /> Add to cart
            </button>
          )}
          <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={savePick} data-testid="dreamland-save-pick">
            <Heart size={14} /> Save
          </button>
          {onShowMore && (
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={showMore} data-testid="dreamland-show-more">
              <RefreshCw size={14} /> Show more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
