"use client";

export default function FeaturedDishCarousel({ items = [], compact = false }) {
  const dishes = Array.isArray(items) ? items.filter((i) => i?.name) : [];
  if (!dishes.length) return null;

  return (
    <div className="space-y-2" data-testid="featured-dish-carousel">
      {!compact && (
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Featured dishes
        </div>
      )}
      <div className={`flex gap-3 overflow-x-auto pb-1 ${compact ? "" : "snap-x"}`}>
        {dishes.map((dish, i) => (
          <div
            key={dish.item_id || dish.name || i}
            className={`shrink-0 card p-3 ${compact ? "min-w-[140px]" : "min-w-[180px] snap-start"}`}
            style={{ background: "var(--surface-2)" }}
          >
            {dish.image_url && (
              <img src={dish.image_url} alt={dish.name} className="w-full h-20 object-cover rounded-lg mb-2" />
            )}
            <div className="font-bold text-sm">{dish.name}</div>
            {dish.price != null && (
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                ${Number(dish.price).toFixed(2)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
