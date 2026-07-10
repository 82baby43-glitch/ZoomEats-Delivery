"use client";

import FeaturedDishCarousel from "./FeaturedDishCarousel";

export default function PartnerStory({ spotlight }) {
  const restaurant = spotlight?.restaurant || {};
  return (
    <section className="space-y-6" data-testid="partner-story">
      {spotlight?.owner_message && (
        <blockquote className="card p-5 border-l-4" style={{ borderColor: "var(--primary)" }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            From the owner
          </div>
          <p className="text-lg font-medium leading-relaxed">&ldquo;{spotlight.owner_message}&rdquo;</p>
        </blockquote>
      )}
      {spotlight?.story && (
        <div className="prose prose-invert max-w-none">
          <p className="text-base leading-relaxed" style={{ color: "var(--text)" }}>
            {spotlight.story}
          </p>
        </div>
      )}
      {!spotlight?.story && restaurant.description && (
        <p className="text-base leading-relaxed" style={{ color: "var(--muted)" }}>
          {restaurant.description}
        </p>
      )}
      {spotlight?.video_url && (
        <video controls className="w-full rounded-2xl" src={spotlight.video_url} />
      )}
      {(spotlight?.media || []).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {spotlight.media.map((m) =>
            m.media_type === "video" ? (
              <video key={m.id} controls className="w-full rounded-xl aspect-video object-cover" src={m.media_url} />
            ) : (
              <img key={m.id} src={m.media_url} alt={m.caption || ""} className="w-full rounded-xl aspect-square object-cover" />
            )
          )}
        </div>
      )}
      <FeaturedDishCarousel items={spotlight?.featured_menu_items || []} />
    </section>
  );
}
