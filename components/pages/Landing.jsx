"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { safeGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/auth";
import Header from "@/components/Header";
import { Search, Star, Clock, Sparkles } from "lucide-react";
import Chatbot from "@/components/Chatbot";
import { sanitizeRestaurants } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

const startLogin = () => {
  signInWithGoogle().catch((e) => console.error("[auth] login failed:", e));
};

const HERO_IMG =
  "https://images.pexels.com/photos/5732798/pexels-photo-5732798.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Landing() {
  const [restaurants, setRestaurants] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await safeGet("/restaurants", [], { params: q ? { q } : {} });
        setRestaurants(sanitizeRestaurants(data));
        setError(false);
      } catch (e) {
        logClientError("landing.restaurants", e);
        setError(true);
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [q]);

  return (
    <div>
      <Header />
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-12 md:pt-20 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="md:col-span-7"
          >
            <div className="label-eyebrow mb-4">Curated · Delivered hot</div>
            <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.95] tracking-tighter">
              Eat well,
              <br />
              <span style={{ color: "var(--primary)" }}>delivered fast.</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: "var(--muted)" }}>
              ZoomEats hand-picks the local kitchens you actually want to eat from. Order in
              minutes — track every step from kitchen to door.
            </p>
            <div className="mt-8 flex items-center gap-3 max-w-xl">
              <div className="flex-1 relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--muted)" }}
                />
                <input
                  className="input-field pl-11"
                  placeholder="Search restaurants or cuisines…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  data-testid="hero-search-input"
                />
              </div>
              {!user && (
                <button className="btn-primary" onClick={startLogin} data-testid="hero-login-button">
                  Get started
                </button>
              )}
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm" style={{ color: "var(--muted)" }}>
              <div className="flex items-center gap-2"><Star size={16} /> 4.7 avg rating</div>
              <div className="flex items-center gap-2"><Clock size={16} /> 25–30 min</div>
              {user && (
                <div className="flex items-center gap-2"><Sparkles size={16} /> Chat with Dreamland</div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="md:col-span-5"
          >
            <div
              className="rounded-3xl overflow-hidden border"
              style={{ borderColor: "var(--border)" }}
            >
              <img src={HERO_IMG} alt="" className="w-full h-[400px] object-cover" />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 md:px-12 pb-24">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="label-eyebrow">Tonight&apos;s table</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-1">
              Restaurants we love
            </h2>
          </div>
        </div>

        {loading && <LoadingSkeleton label="Loading restaurants…" rows={3} />}

        {error && !loading && (
          <ErrorState title="Could not load restaurants" description="Please check your connection and try again." />
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {restaurants.map((r, i) => (
              <motion.div
                key={r.restaurant_id || i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <Link
                  href={`/r/${r.restaurant_id}`}
                  className="card card-hover block"
                  data-testid={`restaurant-card-${r.restaurant_id}`}
                >
                  <div className="aspect-video overflow-hidden">
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ background: "var(--surface-2)" }} />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="label-eyebrow">{r.cuisine || "—"}</div>
                    <h3 className="font-display text-xl font-bold mt-1">{r.name}</h3>
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                      {r.description || ""}
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-sm">
                      <span className="badge"><Star size={14} /> {r.rating ?? "—"}</span>
                      <span className="badge"><Clock size={14} /> {r.delivery_time_min ?? "—"} min</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
            {restaurants.length === 0 && (
              <div className="col-span-full text-center py-12" style={{ color: "var(--muted)" }}>
                No restaurants match. Try another search.
              </div>
            )}
          </div>
        )}
      </section>

      {user && <Chatbot />}
    </div>
  );
}
