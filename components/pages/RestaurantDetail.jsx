"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api, safeGet } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import Header from "@/components/Header";
import Chatbot from "@/components/Chatbot";
import { Star, Clock, Plus, ArrowLeft } from "lucide-react";
import { formatMoney, safeArray } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

export default function RestaurantDetail() {
  const { rid } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { addItem } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  const load = useCallback(async () => {
    if (!rid) return;
    setLoading(true);
    setError(false);
    try {
      const res = await safeGet(`/restaurants/${rid}`, null);
      if (res && typeof res === "object" && res.restaurant) {
        setData({
          restaurant: res.restaurant,
          menu: safeArray(res.menu),
        });
      } else {
        setError(true);
        setData(null);
      }
    } catch (e) {
      logClientError("restaurant.detail", e, { rid });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    load();
  }, [load]);

  const groupedMenu = useMemo(() => {
    if (!data?.menu) return [];
    const map = new Map();
    for (const m of data.menu) {
      const cat = m?.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(m);
    }
    return Array.from(map.entries());
  }, [data?.menu]);

  if (loading) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
          <LoadingSkeleton label="Loading restaurant…" rows={4} />
        </div>
      </div>
    );
  }

  if (error || !data?.restaurant) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
          <ErrorState title="Restaurant not found" description="This restaurant may be unavailable." onRetry={load} />
        </div>
      </div>
    );
  }

  const r = data.restaurant;

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <button type="button" onClick={() => router.push(-1)} className="btn-ghost mb-4 flex items-center gap-2" data-testid="back-button">
          <ArrowLeft size={16} /> Back
        </button>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="relative h-56 md:h-72 rounded-2xl overflow-hidden mb-6">
            <img src={r.cover_url || r.image_url || ""} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-black tracking-tighter">{r.name || "Restaurant"}</h1>
              <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>{r.description || ""}</p>
              <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="flex items-center gap-1"><Star size={14} style={{ color: "var(--primary)" }} /> {r.rating ?? "—"}</span>
                <span className="flex items-center gap-1"><Clock size={14} /> {r.delivery_time_min ?? "—"} min</span>
                <span>{r.cuisine || "—"}</span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-10 space-y-10">
          {groupedMenu.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>No menu items available.</p>
          ) : (
            groupedMenu.map(([cat, items]) => (
              <section key={cat}>
                <h2 className="font-display text-2xl font-bold mb-4">{cat}</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {(items || []).map((m) => (
                    <div key={m.item_id || m.name} className="card p-4 flex gap-4" data-testid={`menu-item-${m.item_id}`}>
                      <img src={m.image_url || ""} alt="" className="w-20 h-20 rounded-xl object-cover" />
                      <div className="flex-1">
                        <div className="font-bold">{m.name || "Item"}</div>
                        <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{m.description || ""}</div>
                        <div className="font-bold mt-2">${formatMoney(m.price)}</div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary !p-3 self-center"
                        onClick={() => user && addItem(r, m)}
                        data-testid={`add-${m.item_id}`}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
      <Chatbot />
    </div>
  );
}
