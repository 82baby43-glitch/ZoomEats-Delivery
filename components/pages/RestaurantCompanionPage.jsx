"use client";

import Header from "@/components/Header";
import Link from "next/link";
import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import CompanionModePanel from "@/components/companion/CompanionModePanel";
import KitchenCompanion from "@/components/companion/KitchenCompanion";
import FloatingMusicPlayer from "@/components/companion/FloatingMusicPlayer";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { sanitizeOrders } from "@/lib/safeData";

export default function RestaurantCompanionPage() {
  const [orders, setOrders] = useState([]);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/vendor/orders");
      setOrders(sanitizeOrders(r?.data));
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Kitchen Companion™</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Order queue, prep timers, and kitchen playlist.
            </p>
          </div>
          <Link href="/restaurant/dashboard" className="btn-ghost text-sm">← Restaurant dashboard</Link>
        </div>
        <CompanionModeProvider>
          <div className="space-y-6">
            <KitchenCompanion orders={orders} />
            <CompanionModePanel role="restaurant" />
          </div>
          <FloatingMusicPlayer className="bottom-6" />
        </CompanionModeProvider>
      </div>
    </div>
  );
}
