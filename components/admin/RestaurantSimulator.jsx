"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChefHat,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Store,
  Trash2,
} from "lucide-react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { LoadingSkeleton } from "@/components/ui/PageStates";
import TestRestaurantDashboard from "@/components/admin/TestRestaurantDashboard";
import MerchantNotificationAdminPanel from "@/components/admin/MerchantNotificationAdminPanel";

export default function RestaurantSimulator() {
  const [status, setStatus] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [lastOrder, setLastOrder] = useState(null);
  const [view, setView] = useState("home");

  const load = useCallback(async () => {
    try {
      const [statusRes, menuRes] = await Promise.all([
        api.get("/admin/restaurant-simulator"),
        api.get("/admin/restaurant-simulator/menu").catch(() => ({ data: [] })),
      ]);
      setStatus(statusRes?.data || statusRes);
      setMenu(Array.isArray(menuRes?.data) ? menuRes.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (key, fn) => {
    setBusy(key);
    try {
      const result = await fn();
      if (key === "create-order") setLastOrder(result?.data?.order || result?.order || null);
      await load();
      return result;
    } catch (e) {
      alert(e?.message || "Action failed");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <LoadingSkeleton rows={6} />
        </div>
      </div>
    );
  }

  const restaurantReady = Boolean(status?.restaurant);

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm" style={{ color: "var(--muted)" }}>
              ← Admin dashboard
            </Link>
            <span className="text-sm mx-2" style={{ color: "var(--muted)" }}>·</span>
            <Link href="/admin/testing-tools" className="text-sm" style={{ color: "var(--muted)" }}>
              Testing Tools
            </Link>
            <h1 className="font-display text-3xl font-bold mt-2 flex items-center gap-3">
              <ChefHat size={28} /> Restaurant Simulator
            </h1>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
              Test the full ZoomEats order lifecycle with an isolated sandbox kitchen. Test orders are excluded from Stripe charges, payouts, and revenue reports.
            </p>
          </div>
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className={view === "home" ? "btn-primary text-sm" : "btn-ghost text-sm"}
            onClick={() => setView("home")}
          >
            Controls
          </button>
          <button
            type="button"
            className={view === "kitchen" ? "btn-primary text-sm" : "btn-ghost text-sm"}
            onClick={() => setView("kitchen")}
            disabled={!restaurantReady}
          >
            Test Restaurant Dashboard
          </button>
        </div>

        {view === "kitchen" ? (
          <div className="mt-8">
            <TestRestaurantDashboard />
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <MerchantNotificationAdminPanel />
            <div className="grid md:grid-cols-2 gap-4">
              <div className="card p-6">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Store size={16} /> Test Kitchen Status
                </div>
                {restaurantReady ? (
                  <div className="mt-4 space-y-2 text-sm">
                    <div><strong>{status.restaurant.name}</strong></div>
                    <div style={{ color: "var(--muted)" }}>{status.restaurant.address}</div>
                    <div style={{ color: "var(--muted)" }}>Phone: {status.restaurant.phone || "Test Number"}</div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>
                        Approved
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                        restaurant_type: test
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                        is_test_account
                      </span>
                    </div>
                    <div className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                      Menu items: {status.menu_count} · Active orders: {status.active_orders} · Completed: {status.completed_orders}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm mt-4" style={{ color: "var(--muted)" }}>
                    No test kitchen configured yet. Run setup to create ZoomEats Test Kitchen with Burger, Fries, and Drink.
                  </p>
                )}
              </div>

              <div className="card p-6">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <ShoppingBag size={16} /> Default Menu
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  {(menu.length ? menu : [
                    { name: "Burger", price: 12.99 },
                    { name: "Fries", price: 4.99 },
                    { name: "Drink", price: 2.49 },
                  ]).map((item) => (
                    <div key={item.item_id || item.name} className="flex justify-between">
                      <span>{item.name}</span>
                      <span>${Number(item.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="text-sm font-bold mb-4">Admin Controls</div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary text-sm inline-flex items-center gap-2"
                  disabled={!!busy}
                  onClick={() => runAction("setup", () => api.post("/admin/restaurant-simulator/setup"))}
                >
                  {busy === "setup" ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />}
                  {restaurantReady ? "Recreate Test Kitchen" : "Setup Test Kitchen"}
                </button>

                <button
                  type="button"
                  className="btn-primary text-sm inline-flex items-center gap-2"
                  disabled={!!busy || !restaurantReady}
                  onClick={() => runAction("create-order", () => api.post("/admin/restaurant-simulator/create-order"))}
                >
                  {busy === "create-order" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Create Test Order
                </button>

                <button
                  type="button"
                  className="btn-secondary text-sm inline-flex items-center gap-2"
                  disabled={!!busy || !restaurantReady}
                  onClick={() => {
                    setView("kitchen");
                  }}
                >
                  <ExternalLink size={14} /> Login As Test Restaurant
                </button>

                <button
                  type="button"
                  className="btn-ghost text-sm inline-flex items-center gap-2"
                  disabled={!!busy || !restaurantReady}
                  onClick={() => runAction("clear", () => api.post("/admin/restaurant-simulator/clear-orders"))}
                >
                  {busy === "clear" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Clear Test Orders
                </button>

                <button
                  type="button"
                  className="btn-ghost text-sm inline-flex items-center gap-2"
                  disabled={!!busy}
                  onClick={() => {
                    if (!confirm("Reset test environment? This clears all test orders and recreates the kitchen.")) return;
                    runAction("reset", () => api.post("/admin/restaurant-simulator/reset"));
                  }}
                >
                  {busy === "reset" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Reset Test Environment
                </button>
              </div>
            </div>

            {lastOrder && (
              <div className="card p-6">
                <div className="text-sm font-bold mb-2">Latest Test Order</div>
                <div className="text-sm space-y-1">
                  <div>Order ID: <code>{lastOrder.order_id}</code></div>
                  <div>Status: {lastOrder.status} · Payment: {lastOrder.payment_status}</div>
                  <div style={{ color: "var(--muted)" }}>
                    Customer tracking and driver offers use the real production pipeline. Open the Test Restaurant Dashboard to accept and prepare.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/orders/${lastOrder.order_id}`} className="btn-ghost text-sm">
                      View customer tracking
                    </Link>
                    <button type="button" className="btn-ghost text-sm" onClick={() => setView("kitchen")}>
                      Open test kitchen
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
              <strong style={{ color: "var(--text)" }}>How to test the full lifecycle</strong>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>Setup Test Kitchen (creates ZoomEats Test Kitchen + menu)</li>
                <li>Create Test Order (skips Stripe, marks paid, triggers dispatch)</li>
                <li>Open Test Restaurant Dashboard → Accept → Preparing → Ready</li>
                <li>Driver app receives offer after accept; complete pickup and delivery there</li>
                <li>Customer order tracking updates throughout</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
