"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import PartnerBadge from "@/components/restaurants/PartnerBadge";

function formatRestaurantLocation(restaurant) {
  const parts = [restaurant.address, restaurant.city, restaurant.state].filter(Boolean);
  return parts.join(", ") || "Address unavailable";
}

export default function RestaurantSelector({
  value,
  onChange,
  onSelectRestaurant,
  claimableOnly = false,
  showPartnerBadge = true,
  placeholder = "Choose restaurant…",
  className = "",
  initialRestaurants = null,
}) {
  const [restaurants, setRestaurants] = useState(initialRestaurants || []);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(!initialRestaurants);
  const [error, setError] = useState(false);
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    if (initialRestaurants) {
      setRestaurants(initialRestaurants);
      return;
    }
    setLoading(true);
    try {
      const params = { limit: "500" };
      if (claimableOnly) params.claimable = "1";
      const r = await api.get("/restaurants/listings", { params });
      setRestaurants(Array.isArray(r?.data?.restaurants) ? r.data.restaurants : []);
      setCategories(Array.isArray(r?.data?.categories) ? r.data.categories : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [claimableOnly, initialRestaurants]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    let list = [...restaurants];
    if (category) {
      const needle = category.toLowerCase();
      list = list.filter((r) =>
        [r.cuisine, r.primary_category].some((v) => String(v || "").toLowerCase().includes(needle))
      );
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((r) =>
        [r.name, r.address, r.city, r.state, r.cuisine, r.primary_category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
  }, [restaurants, query, category]);

  const selected = restaurants.find((r) => r.restaurant_id === value) || null;

  const choose = (restaurant) => {
    onChange?.(restaurant.restaurant_id);
    onSelectRestaurant?.(restaurant);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} data-testid="restaurant-selector">
      <button
        type="button"
        className="input-field w-full text-left flex items-center justify-between gap-3"
        onClick={() => setOpen((v) => !v)}
        data-testid="restaurant-selector-trigger"
      >
        <span className={selected ? "" : "text-[var(--muted)]"}>
          {selected ? selected.name : placeholder}
        </span>
        {selected && showPartnerBadge ? <PartnerBadge status={selected.partner_status} /> : null}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 w-full rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
              <input
                className="input-field w-full pl-9"
                placeholder="Search restaurants…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                data-testid="restaurant-selector-search"
              />
            </div>
            {categories.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  className={`badge shrink-0 ${!category ? "ring-2 ring-[var(--primary)]" : ""}`}
                  onClick={() => setCategory("")}
                >
                  All
                </button>
                {categories.slice(0, 12).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`badge shrink-0 ${category === cat ? "ring-2 ring-[var(--primary)]" : ""}`}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading && <div className="p-4 text-sm" style={{ color: "var(--muted)" }}>Loading restaurants…</div>}
            {error && <div className="p-4 text-sm text-red-400">Could not load restaurants.</div>}
            {!loading && !error && filtered.length === 0 && (
              <div className="p-4 text-sm" style={{ color: "var(--muted)" }}>No restaurants match your search.</div>
            )}
            {filtered.map((restaurant) => (
              <button
                key={restaurant.restaurant_id}
                type="button"
                className="w-full text-left px-4 py-3 border-b hover:bg-[var(--surface-2)] transition-colors"
                style={{ borderColor: "var(--border)" }}
                onClick={() => choose(restaurant)}
                data-testid={`restaurant-option-${restaurant.restaurant_id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{restaurant.name}</div>
                    <div className="text-xs mt-1 flex items-start gap-1" style={{ color: "var(--muted)" }}>
                      <MapPin size={12} className="shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{formatRestaurantLocation(restaurant)}</span>
                    </div>
                    {restaurant.cuisine && (
                      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{restaurant.cuisine}</div>
                    )}
                  </div>
                  {showPartnerBadge && <PartnerBadge status={restaurant.partner_status} />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-3 p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display font-bold text-lg">{selected.name}</div>
              <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{formatRestaurantLocation(selected)}</div>
              {selected.cuisine && <div className="text-sm mt-1">{selected.cuisine}</div>}
            </div>
            <button type="button" className="btn-ghost !p-2" onClick={() => { onChange?.(""); onSelectRestaurant?.(null); }} aria-label="Clear selection">
              <X size={16} />
            </button>
          </div>
          {showPartnerBadge && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span style={{ color: "var(--muted)" }}>Status:</span>
              <PartnerBadge status={selected.partner_status} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
