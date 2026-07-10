"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, safeGet } from "@/lib/api";
import Header from "@/components/Header";
import PartnerStory from "@/components/spotlight/PartnerStory";
import FeaturedDishCarousel from "@/components/spotlight/FeaturedDishCarousel";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { MapPin, Share2, Star, Clock, ShoppingBag } from "lucide-react";

export default function LocalPartnerDetail() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const [spotlight, setSpotlight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shared, setShared] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const data = await safeGet(`/spotlight/partners/${slug}`, null);
      if (data?.id) {
        setSpotlight(data);
        setError(false);
        await api.post("/spotlight/analytics", {
          event_type: "spotlight_view",
          spotlight_id: data.id,
          restaurant_id: data.restaurant_id,
        });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const restaurant = spotlight?.restaurant || {};
  const cover = spotlight?.cover_image_url || restaurant.cover_url || restaurant.image_url;

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: spotlight?.title || restaurant.name,
          text: spotlight?.story || "Discover this local partner on ZoomEats",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
      await api.post("/spotlight/analytics", {
        event_type: "share_click",
        spotlight_id: spotlight?.id,
        restaurant_id: spotlight?.restaurant_id,
      });
    } catch {
      /* user cancelled */
    }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading partner story…" rows={5} /></div>
      </div>
    );
  }

  if (error || !spotlight) {
    return (
      <div>
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-12">
          <ErrorState title="Partner not found" onRetry={load} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="local-partner-detail">
      <Header />
      <div className="relative h-[42vh] min-h-[280px] overflow-hidden">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: "var(--surface-2)" }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-6 md:px-12 -mt-20 relative pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label-eyebrow">Local Partner Spotlight</div>
            <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight mt-1">
              {spotlight.title || restaurant.name}
            </h1>
            <p className="mt-2 flex flex-wrap gap-3 text-sm" style={{ color: "var(--muted)" }}>
              {restaurant.cuisine && <span>{restaurant.cuisine}</span>}
              {restaurant.city && <span className="flex items-center gap-1"><MapPin size={14} /> {restaurant.city}</span>}
              {restaurant.rating != null && <span className="flex items-center gap-1"><Star size={14} /> {restaurant.rating}</span>}
              {restaurant.delivery_time_min != null && <span className="flex items-center gap-1"><Clock size={14} /> {restaurant.delivery_time_min} min</span>}
            </p>
          </div>
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={share}>
            <Share2 size={16} /> {shared ? "Link copied!" : "Share"}
          </button>
        </div>

        {spotlight.promotion_text && (
          <div className="card p-4 mt-6 font-bold" style={{ background: "rgba(182,241,39,0.1)", color: "var(--primary)" }}>
            {spotlight.promotion_text}
          </div>
        )}

        <div className="mt-8">
          <PartnerStory spotlight={spotlight} />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={`/r/${restaurant.restaurant_id}?spotlight=${spotlight.id}`}
            className="btn-primary flex items-center gap-2"
            onClick={() =>
              api.post("/spotlight/analytics", {
                event_type: "menu_click",
                spotlight_id: spotlight.id,
                restaurant_id: spotlight.restaurant_id,
              })
            }
          >
            <ShoppingBag size={18} /> Order now
          </Link>
          <Link
            href={`/r/${restaurant.restaurant_id}`}
            className="btn-secondary"
            onClick={() =>
              api.post("/spotlight/analytics", {
                event_type: "restaurant_page_click",
                spotlight_id: spotlight.id,
                restaurant_id: spotlight.restaurant_id,
              })
            }
          >
            View menu
          </Link>
        </div>

        <p className="mt-8 text-sm text-center" style={{ color: "var(--muted)" }}>
          ZoomEats connects you with the local businesses that make your city unique.
        </p>
      </div>
    </div>
  );
}
