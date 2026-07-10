"use client";

import Link from "next/link";
import { Star, MapPin, Clock, Sparkles } from "lucide-react";
import FeaturedDishCarousel from "./FeaturedDishCarousel";

export default function SpotlightCard({ spotlight, featured = false, onView }) {
  const restaurant = spotlight?.restaurant || {};
  const cover = spotlight?.cover_image_url || restaurant.cover_url || restaurant.image_url;
  const logo = spotlight?.logo_url || restaurant.image_url;

  return (
    <article
      className={`card overflow-hidden ${featured ? "ring-2" : ""}`}
      style={featured ? { borderColor: "var(--primary)" } : undefined}
      data-testid={`spotlight-card-${spotlight?.id}`}
      onClick={() => onView?.(spotlight)}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {cover ? (
          <img src={cover} alt={spotlight?.title || restaurant.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: "var(--surface-2)" }} />
        )}
        {featured && (
          <div className="absolute top-3 left-3 badge" style={{ background: "var(--primary)", color: "#0A0A0A" }}>
            <Sparkles size={12} /> Featured Columbia Partner
          </div>
        )}
        {logo && (
          <img
            src={logo}
            alt=""
            className="absolute bottom-3 left-3 w-12 h-12 rounded-full border-2 object-cover"
            style={{ borderColor: "var(--surface)" }}
          />
        )}
      </div>
      <div className="p-5 space-y-3">
        <div className="label-eyebrow">{restaurant.cuisine || "Local partner"}</div>
        <h3 className="font-display text-2xl font-black tracking-tight">
          {spotlight?.title || restaurant.name}
        </h3>
        <p className="text-sm line-clamp-3" style={{ color: "var(--muted)" }}>
          {spotlight?.story || restaurant.description || "A local favorite on ZoomEats."}
        </p>
        {spotlight?.promotion_text && (
          <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
            {spotlight.promotion_text}
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          {restaurant.rating != null && (
            <span className="badge"><Star size={14} /> {restaurant.rating}</span>
          )}
          {restaurant.delivery_time_min != null && (
            <span className="badge"><Clock size={14} /> {restaurant.delivery_time_min} min</span>
          )}
          {restaurant.city && (
            <span className="badge"><MapPin size={14} /> {restaurant.city}</span>
          )}
        </div>
        <FeaturedDishCarousel items={spotlight?.featured_menu_items || []} compact />
        <div className="flex gap-2 pt-1">
          <Link
            href={spotlight?.slug ? `/local-partners/${spotlight.slug}` : `/r/${restaurant.restaurant_id}`}
            className="btn-secondary flex-1 text-center text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            View story
          </Link>
          <Link
            href={`/r/${restaurant.restaurant_id}?spotlight=${spotlight?.id || ""}`}
            className="btn-primary flex-1 text-center text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            Order now
          </Link>
        </div>
      </div>
    </article>
  );
}
