"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, getApiErrorMessage, getWalletBalance, requestWalletPayout } from "@/lib/api";
import Header from "@/components/Header";
import { useRealtimeRow } from "@/lib/useRealtime";
import { useWebPush } from "@/lib/useWebPush";
import { primeChime, playChime } from "@/lib/chime";
import { Plus, Trash2, Wifi, Bell, BellOff, MapPin, Headphones } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney, sanitizeOrders, sanitizeWallet, safeArray } from "@/lib/safeData";
import { isPaymentConfirmed } from "@/lib/orderState";
import { logClientError } from "@/lib/clientErrorLog";
import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import KitchenCompanion from "@/components/companion/KitchenCompanion";
import FloatingMusicPlayer from "@/components/companion/FloatingMusicPlayer";
import { useCompanionRealtime } from "@/lib/hooks/useCompanionRealtime";
import { useCompanionMode } from "@/lib/hooks/useCompanionMode";
import VendorCommunityProfile from "@/components/vendor/VendorCommunityProfile";
import MenuImageEnhancer from "@/components/vendor/MenuImageEnhancer";
import { useAuth } from "@/lib/auth";
import VendorSettlementsPanel from "@/components/vendor/VendorSettlementsPanel";
import VendorOrderPricing from "@/components/vendor/VendorOrderPricing";

const STATUS_NEXT = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
};

const FOOD_IMG = "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function VendorDashboard() {
  return (
    <CompanionModeProvider>
      <VendorDashboardInner />
    </CompanionModeProvider>
  );
}

function VendorDashboardInner() {
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ name: "", description: "", cuisine: "", image_url: "", cover_url: "", address: "" });
  const [item, setItem] = useState({ name: "", description: "", price: "", image_url: "", category: "Mains" });
  const [tab, setTab] = useState("orders");
  const [wallet, setWallet] = useState({ available: 0.0, pending: 0.0 });
  const [payoutAmt, setPayoutAmt] = useState(0.0);
  const [livePulse, setLivePulse] = useState(0);
  const { permission, request, fire } = useWebPush("ZoomEats Kitchen");
  // Track which "placed" orders have already been notified so we don't ping on every poll.
  const notifiedRef = useRef(new Set());
  const driverAssignedRef = useRef(new Set());
  // First load is silent — only orders that *arrive* after mount trigger a notification.
  const primedRef = useRef(false);
  const { user } = useAuth();
  const { settings: companionSettings } = useCompanionMode();

  const load = useCallback(async () => {
    try {
      const r = await api.get("/vendor/restaurant");
      const restaurantData = r?.data ?? null;
      setRestaurant(restaurantData);
      if (restaurantData) {
        setForm({
          name: restaurantData.name ?? "",
          description: restaurantData.description ?? "",
          cuisine: restaurantData.cuisine ?? "",
          image_url: restaurantData.image_url ?? "",
          cover_url: restaurantData.cover_url ?? "",
          address: restaurantData.address ?? "",
        });
        const m = await api.get("/vendor/menu-items");
        setMenu(safeArray(m?.data));
        const o = await api.get("/vendor/orders");
        const wb = await getWalletBalance();
        setWallet(sanitizeWallet(wb?.data));
        const orderList = sanitizeOrders(o?.data);
        setOrders(orderList);

        const fresh = orderList.filter(
          (x) => x.status === "placed" && isPaymentConfirmed(x) && !notifiedRef.current.has(x.order_id)
        );
        if (primedRef.current && fresh.length > 0) {
          fresh.forEach((x) => {
            fire(
              `New order · $${formatMoney(x.total)}`,
              `${x.customer_name} — ${(x.items || []).map((i) => `${i.quantity}× ${i.name}`).join(", ")}`,
              { tag: `order-${x.order_id}` }
            );
          });
          playChime();
        }
        orderList.forEach((x) => {
          if (x.status === "placed") notifiedRef.current.add(x.order_id);
        });

        const newlyAssigned = orderList.filter(
          (x) => (x.status === "assigned_internal" || x.driver_id) && !driverAssignedRef.current.has(x.order_id)
        );
        if (primedRef.current && newlyAssigned.length > 0) {
          newlyAssigned.forEach((x) => {
            fire("Driver assigned", `A driver is heading to pick up order #${String(x.order_id).slice(-6)}`, {
              tag: `driver-${x.order_id}`,
            });
            playChime();
          });
        }
        orderList.forEach((x) => {
          if (x.status === "assigned_internal" || x.driver_id) driverAssignedRef.current.add(x.order_id);
        });

        primedRef.current = true;
      }
    } catch (e) {
      logClientError("vendor.load", e);
    }
  }, [fire]);

  const doPayout = async () => {
    try {
      const res = await requestWalletPayout(parseFloat(payoutAmt));
      alert(`Payout requested: ${res?.data?.payout_id ?? "unknown"} · ${res?.data?.status ?? "pending"}`);
      const wb = await getWalletBalance();
      setWallet(sanitizeWallet(wb?.data));
    } catch (e) {
      alert("Payout failed: " + getApiErrorMessage(e));
    }
  };

  useEffect(() => { load(); }, [load]);

  // ---- Realtime: subscribe to orders for this restaurant ----
  const onRealtime = useCallback(() => {
    setLivePulse((p) => p + 1);
    load();
  }, [load]);
  useRealtimeRow("orders", "restaurant_id", restaurant?.restaurant_id, onRealtime);

  useCompanionRealtime({
    role: "restaurant",
    userId: user?.user_id,
    restaurantId: restaurant?.restaurant_id,
    enabled: !!user?.user_id && !!restaurant?.restaurant_id,
    audioPreferences: companionSettings?.audio_preferences,
    onRefresh: load,
  });

  // Fallback polling every 10s so reloads aren't realtime-only
  useEffect(() => {
    if (!restaurant) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [restaurant, load]);

  const saveRestaurant = async () => {
    try {
      await api.post("/vendor/restaurant", form);
      await load();
    } catch (e) {
      logClientError("vendor.saveRestaurant", e);
    }
  };

  const addItem = async () => {
    if (!item.name || !item.price) return;
    try {
      await api.post("/vendor/menu-items", { ...item, price: parseFloat(item.price), image_url: item.image_url || FOOD_IMG });
      setItem({ name: "", description: "", price: "", image_url: "", category: "Mains" });
      await load();
    } catch (e) {
      logClientError("vendor.addItem", e);
    }
  };

  const removeItem = async (id) => {
    try {
      await api.delete(`/vendor/menu-items/${id}`);
      await load();
    } catch (e) {
      logClientError("vendor.removeItem", e);
    }
  };

  const advance = async (oid, current) => {
    const next = STATUS_NEXT[current];
    if (!next) return;
    try {
      await api.post(`/vendor/orders/${oid}/status`, { status: next });
      await load();
    } catch (e) {
      logClientError("vendor.advance", e);
    }
  };

  if (!restaurant) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="font-display text-4xl font-black tracking-tighter">Set up your restaurant</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Tell customers who you are.</p>
          <div className="card p-6 mt-6 space-y-4">
            <input className="input-field" placeholder="Restaurant name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="vendor-name" />
            <input className="input-field" placeholder="Cuisine (e.g. Italian)" value={form.cuisine} onChange={(e) => setForm({ ...form, cuisine: e.target.value })} data-testid="vendor-cuisine" />
            <textarea className="input-field" rows={3} placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="vendor-desc" />
            <input className="input-field" placeholder="Cover image URL" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} />
            <input className="input-field" placeholder="Card image URL" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            <input className="input-field" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <button className="btn-primary" onClick={saveRestaurant} data-testid="vendor-save">Create restaurant</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-4xl font-black tracking-tighter">{restaurant.name}</h1>
          <Link href="/restaurant/live-map" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="restaurant-live-map-link">
            <MapPin size={16} /> Live Map
          </Link>
          <Link href="/restaurant/companion" className="btn-secondary inline-flex items-center gap-2 text-sm" data-testid="kitchen-companion-link">
            <Headphones size={16} /> Kitchen Companion
          </Link>
          <span
            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md"
            style={{ background: "var(--surface-2)", color: livePulse > 0 ? "var(--primary)" : "var(--muted)" }}
            data-testid="vendor-live-indicator"
            title={livePulse > 0 ? `${livePulse} realtime events` : "Awaiting events"}
          >
            <Wifi size={12} /> Live
          </span>
          {permission !== "granted" ? (
            <button
              onClick={() => { primeChime(); request(); }}
              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md transition-colors"
              style={{
                background: "var(--surface-2)",
                color: permission === "denied" ? "var(--muted)" : "var(--primary)",
                cursor: permission === "denied" ? "not-allowed" : "pointer",
              }}
              disabled={permission === "denied"}
              data-testid="enable-notifications-btn"
              title={permission === "denied" ? "Notifications blocked — re-enable in browser settings" : "Get a desktop ping + chime when new orders arrive"}
            >
              {permission === "denied" ? <BellOff size={12} /> : <Bell size={12} />}
              {permission === "denied" ? "Notifications blocked" : "Enable notifications"}
            </button>
          ) : (
            <>
              <span
                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--primary)" }}
                data-testid="notifications-on-indicator"
                title="Desktop notifications + chime are on"
              >
                <Bell size={12} /> Pings on
              </span>
              <button
                onClick={() => { primeChime(); playChime(); }}
                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md transition-colors"
                style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                data-testid="test-chime-btn"
                title="Play the new-order chime"
              >
                Test sound
              </button>
            </>
          )}
        </div>
        <p className="mt-2" style={{ color: "var(--muted)" }}>Vendor dashboard</p>
        <div className="flex gap-2 mt-6 border-b" style={{ borderColor: "var(--border)" }}>
          {["orders", "settlements", "companion", "menu", "community", "profile"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 capitalize font-bold"
              style={{
                color: tab === t ? "var(--text)" : "var(--muted)",
                borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
              }}
              data-testid={`vendor-tab-${t}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "orders" && (
          <div className="mt-6 space-y-3">
            {orders.length === 0 && <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>No orders yet.</div>}
            <AnimatePresence initial={false}>
              {orders.map((o) => (
                <motion.div
                  key={o.order_id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  className="card p-5"
                  data-testid={`vendor-order-${o.order_id}`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="font-display text-lg font-bold">{o.customer_name}</div>
                      <div className="text-sm" style={{ color: "var(--muted)" }}>{o.address}</div>
                      <div className="mt-2 text-sm">
                        {(o.items || []).map((it) => `${it.quantity}× ${it.name}`).join(", ") || "—"}
                      </div>
                    </div>
                  <div className="text-right">
                    <div className="font-display font-bold">${formatMoney(o.total)}</div>
                    <div className="badge mt-2">{o.status}</div>
                  </div>
                </div>
                {STATUS_NEXT[o.status] && isPaymentConfirmed(o) && (
                  <button
                    className="btn-primary mt-4 !py-2"
                    onClick={() => advance(o.order_id, o.status)}
                    data-testid={`advance-${o.order_id}`}
                  >
                    Mark as {STATUS_NEXT[o.status]}
                  </button>
                )}
                {isPaymentConfirmed(o) && <VendorOrderPricing orderId={o.order_id} />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {tab === "settlements" && <VendorSettlementsPanel />}

        {tab === "companion" && (
          <div className="mt-6">
            <KitchenCompanion orders={orders} />
          </div>
        )}

        {tab === "menu" && (
          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <div className="card p-5 md:col-span-1 h-fit space-y-3">
              <h3 className="font-display text-lg font-bold">Add new item</h3>
              <input className="input-field" placeholder="Name" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} data-testid="menu-item-name" />
              <textarea className="input-field" rows={2} placeholder="Description" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
              <input className="input-field" placeholder="Price" type="number" step="0.01" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} data-testid="menu-item-price" />
              <MenuImageEnhancer
                imageUrl={item.image_url}
                onImageUrl={(url) => setItem((prev) => ({ ...prev, image_url: url }))}
              />
              <input className="input-field" placeholder="Or paste image URL" value={item.image_url} onChange={(e) => setItem({ ...item, image_url: e.target.value })} />
              <select className="input-field" value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })}>
                {["Starters", "Mains", "Sides", "Desserts", "Drinks"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <button className="btn-primary w-full" onClick={addItem} data-testid="add-menu-item">
                <Plus size={16} /> Add item
              </button>
            </div>
            <div className="md:col-span-2 space-y-3">
              {menu.map((m) => (
                <div key={m.item_id} className="card p-4 flex items-center gap-4">
                  <img src={m.image_url || FOOD_IMG} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-1">
                    <div className="font-bold">{m.name}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>{m.category || "—"} · ${formatMoney(m.price)}</div>
                  </div>
                  <button className="btn-ghost !p-2" onClick={() => removeItem(m.item_id)} data-testid={`del-menu-${m.item_id}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "community" && <VendorCommunityProfile />}

        {tab === "profile" && (
          <div className="card p-6 mt-6 space-y-4 max-w-2xl">
            <div className="card p-4 mb-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="label-eyebrow">Wallet</div>
                  <div className="font-display text-xl font-bold">${formatMoney(wallet.available)}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>Pending: ${formatMoney(wallet.pending)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input className="input-field" type="number" step="0.01" value={payoutAmt} onChange={(e) => setPayoutAmt(e.target.value)} style={{ width: 140 }} />
                  <button className="btn-primary" onClick={doPayout}>Payout</button>
                </div>
              </div>
            </div>
            <input className="input-field" placeholder="Restaurant name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input-field" placeholder="Cuisine" value={form.cuisine} onChange={(e) => setForm({ ...form, cuisine: e.target.value })} />
            <textarea className="input-field" rows={3} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className="input-field" placeholder="Cover image URL" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} />
            <input className="input-field" placeholder="Card image URL" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            <input className="input-field" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <button className="btn-primary" onClick={saveRestaurant}>Save changes</button>
          </div>
        )}
      </div>
      <FloatingMusicPlayer className="bottom-6" />
    </div>
  );
}
