"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellOff,
  ChefHat,
  Clock,
  DollarSign,
  Headphones,
  MapPin,
  Power,
  Star,
  Truck,
  UtensilsCrossed,
  Wifi,
} from "lucide-react";
import Header from "@/components/Header";
import { api, getApiErrorMessage, getWalletBalance, requestWalletPayout } from "@/lib/api";
import { useRealtimeRow } from "@/lib/useRealtime";
import { useWebPush } from "@/lib/useWebPush";
import { primeChime, playChime } from "@/lib/chime";
import { formatMoney, sanitizeOrders, sanitizeWallet, safeArray } from "@/lib/safeData";
import { isPaymentConfirmed } from "@/lib/orderState";
import { acceptMinutesRemaining, isIncomingUnacknowledged } from "@/lib/merchant/incomingOrderAlerts";
import { useMerchantIncomingOrderAlerts } from "@/lib/hooks/useMerchantIncomingOrderAlerts";
import IncomingOrderAlertBanner from "@/components/merchant/IncomingOrderAlertBanner";
import MerchantAlertSettingsPanel from "@/components/merchant/MerchantAlertSettingsPanel";
import { logClientError } from "@/lib/clientErrorLog";
import { useAuth } from "@/lib/auth";
import { useCompanionRealtime } from "@/lib/hooks/useCompanionRealtime";
import { useCompanionMode } from "@/lib/hooks/useCompanionMode";
import KitchenCompanion from "@/components/companion/KitchenCompanion";
import FloatingMusicPlayer from "@/components/companion/FloatingMusicPlayer";
import VendorCommunityProfile from "@/components/vendor/VendorCommunityProfile";
import VendorSettlementsPanel from "@/components/vendor/VendorSettlementsPanel";
import VendorOrderPricing from "@/components/vendor/VendorOrderPricing";
import KitchenDisplaySystem from "@/components/restaurant/KitchenDisplaySystem";
import RestaurantAnalyticsPanel from "@/components/restaurant/RestaurantAnalyticsPanel";
import RestaurantMenuManager from "@/components/restaurant/RestaurantMenuManager";
import RestaurantStoreSettings from "@/components/restaurant/RestaurantStoreSettings";
import RestaurantMessaging from "@/components/restaurant/RestaurantMessaging";
import { RestaurantNotificationProvider, useRestaurantNotify } from "@/components/restaurant/RestaurantNotifications";

const FOOD_IMG = "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const TABS = [
  { id: "home", label: "Dashboard" },
  { id: "orders", label: "Orders" },
  { id: "kitchen", label: "Kitchen" },
  { id: "drivers", label: "Drivers" },
  { id: "analytics", label: "Analytics" },
  { id: "menu", label: "Menu" },
  { id: "store", label: "Store" },
  { id: "messages", label: "Messages" },
  { id: "settlements", label: "Payouts" },
  { id: "companion", label: "Companion" },
  { id: "community", label: "Community" },
];

const STATUS_ACTIONS = {
  placed: [
    { status: "accepted", label: "Accept", primary: true },
    { status: "cancelled", label: "Reject" },
  ],
  accepted: [{ status: "preparing", label: "Start Preparing", primary: true }],
  preparing: [{ status: "ready", label: "Mark Ready", primary: true }],
  ready: [{ status: "picked_up", label: "Hand Off to Driver", primary: true }],
  picked_up: [{ status: "delivered", label: "Complete Order", primary: true }],
};

export default function RestaurantProductionDashboard() {
  return (
    <RestaurantNotificationProvider>
      <RestaurantProductionDashboardInner />
    </RestaurantNotificationProvider>
  );
}

function RestaurantProductionDashboardInner() {
  const [dashboard, setDashboard] = useState(null);
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logistics, setLogistics] = useState(null);
  const [tab, setTab] = useState("home");
  const [wallet, setWallet] = useState({ available: 0, pending: 0 });
  const [payoutAmt, setPayoutAmt] = useState(0);
  const [livePulse, setLivePulse] = useState(0);
  const [busyOrder, setBusyOrder] = useState(null);
  const [setupForm, setSetupForm] = useState({ name: "", description: "", cuisine: "", image_url: "", cover_url: "", address: "" });
  const [dataPrimed, setDataPrimed] = useState(false);
  const [highlightOrderId, setHighlightOrderId] = useState(null);

  const { permission, request, fire } = useWebPush("ZoomEats Merchant");
  const { notify } = useRestaurantNotify();
  const driverAssignedRef = useRef(new Set());
  const { user } = useAuth();
  const { settings: companionSettings } = useCompanionMode();

  const restaurant = dashboard?.restaurant;
  const stats = dashboard?.stats || {};
  const prepMinutes = restaurant?.delivery_time_min || 20;
  const isSandbox = Boolean(restaurant?.is_test_account || restaurant?.restaurant_type === "test");

  const handleViewOrder = useCallback((orderId) => {
    setTab("orders");
    setHighlightOrderId(orderId);
    setTimeout(() => setHighlightOrderId(null), 8000);
  }, []);

  const {
    settings: alertSettings,
    updateSettings: updateAlertSettings,
    testSound: testAlertSound,
    banner: alertBanner,
    dismissBanner,
    unacknowledgedCount,
    sortedOrders,
    isPulsing,
    isOnline: alertsOnline,
  } = useMerchantIncomingOrderAlerts({
    merchantId: restaurant?.restaurant_id,
    sandbox: isSandbox,
    orders,
    prepMinutes,
    primed: dataPrimed,
    onPush: fire,
    onViewOrder: handleViewOrder,
  });

  const load = useCallback(async () => {
    try {
      const [dashRes, menuRes, ordersRes, logisticsRes, walletRes] = await Promise.all([
        api.get("/vendor/dashboard").catch(() => api.get("/vendor/restaurant").then((r) => ({ data: { restaurant: r?.data } })).catch(() => null)),
        api.get("/vendor/menu-items").catch(() => ({ data: [] })),
        api.get("/vendor/orders").catch(() => ({ data: [] })),
        api.get("/logistics/restaurant").catch(() => null),
        getWalletBalance().catch(() => ({ data: {} })),
      ]);

      const dash = dashRes?.data || dashRes;
      setDashboard(dash);
      setMenu(safeArray(menuRes?.data));
      const orderList = sanitizeOrders(ordersRes?.data);
      setOrders(orderList);
      setLogistics(logisticsRes?.data || logisticsRes);
      setWallet(sanitizeWallet(walletRes?.data));

      if (dash?.restaurant) {
        setSetupForm({
          name: dash.restaurant.name ?? "",
          description: dash.restaurant.description ?? "",
          cuisine: dash.restaurant.cuisine ?? "",
          image_url: dash.restaurant.image_url ?? "",
          cover_url: dash.restaurant.cover_url ?? "",
          address: dash.restaurant.address ?? "",
        });
      }

      const fresh = orderList.filter(
        (x) => x.status === "placed" && isPaymentConfirmed(x)
      );
      void fresh;

      const newlyAssigned = orderList.filter(
        (x) => (x.status === "assigned_internal" || x.driver_id) && !driverAssignedRef.current.has(x.order_id)
      );
      if (dataPrimed && newlyAssigned.length > 0) {
        newlyAssigned.forEach((x) => {
          fire("Driver assigned", `Driver heading to pick up #${String(x.order_id).slice(-6)}`, { tag: `driver-${x.order_id}` });
          notify("Driver assigned", `Order #${String(x.order_id).slice(-6)}`);
          playChime();
        });
      }
      orderList.forEach((x) => {
        if (x.status === "assigned_internal" || x.driver_id) driverAssignedRef.current.add(x.order_id);
      });

      setDataPrimed(true);
    } catch (e) {
      logClientError("restaurant.dashboard.load", e);
    }
  }, [fire, notify, dataPrimed]);

  useEffect(() => { load(); }, [load]);

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

  useEffect(() => {
    if (!restaurant) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [restaurant, load]);

  const updateOrderStatus = async (orderId, status) => {
    setBusyOrder(orderId);
    try {
      await api.post(`/vendor/orders/${orderId}/status`, { status });
      if (status === "accepted" || status === "cancelled") {
        dismissBanner(orderId);
      }
      await load();
    } catch (e) {
      notify("Action failed", getApiErrorMessage(e));
      api.post("/admin/merchant-notifications/log-failure", {
        merchant_id: restaurant?.restaurant_id,
        order_id: orderId,
        channel: "order_status",
        message: getApiErrorMessage(e),
        environment: isSandbox ? "sandbox" : "production",
      }).catch(() => {});
    } finally {
      setBusyOrder(null);
    }
  };

  const toggleOnline = async () => {
    const next = !(restaurant?.online_status !== false && restaurant?.accepting_orders !== false);
    await api.patch("/vendor/restaurant/settings", {
      online_status: next,
      accepting_orders: next,
    });
    await load();
    notify(next ? "You're online" : "You're offline", next ? "Accepting orders" : "Not accepting orders");
  };

  const saveRestaurant = async () => {
    await api.post("/vendor/restaurant", setupForm);
    await load();
  };

  const saveStoreSettings = async (patch) => {
    await api.patch("/vendor/restaurant/settings", patch);
    await load();
    notify("Store updated", "Your settings have been saved");
  };

  const addMenuItem = async (item) => {
    await api.post("/vendor/menu-items", item);
    await load();
  };

  const updateMenuItem = async (id, patch) => {
    await api.put(`/vendor/menu-items/${id}`, patch);
    await load();
  };

  const deleteMenuItem = async (id) => {
    await api.delete(`/vendor/menu-items/${id}`);
    await load();
  };

  const duplicateMenuItem = async (id) => {
    await api.post(`/vendor/menu-items/${id}/duplicate`);
    await load();
  };

  const doPayout = async () => {
    try {
      const res = await requestWalletPayout(parseFloat(payoutAmt));
      notify("Payout requested", res?.data?.status || "pending");
      const wb = await getWalletBalance();
      setWallet(sanitizeWallet(wb?.data));
    } catch (e) {
      notify("Payout failed", getApiErrorMessage(e));
    }
  };

  if (!restaurant) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-12 restaurant-dashboard">
          <h1 className="font-display text-4xl font-black tracking-tighter">Set up your restaurant</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Create your live restaurant profile to start receiving orders.</p>
          <div className="card p-6 mt-6 space-y-4">
            <input className="input-field" placeholder="Restaurant name" value={setupForm.name} onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })} />
            <input className="input-field" placeholder="Cuisine" value={setupForm.cuisine} onChange={(e) => setSetupForm({ ...setupForm, cuisine: e.target.value })} />
            <textarea className="input-field" rows={3} placeholder="Description" value={setupForm.description} onChange={(e) => setSetupForm({ ...setupForm, description: e.target.value })} />
            <input className="input-field" placeholder="Address" value={setupForm.address} onChange={(e) => setSetupForm({ ...setupForm, address: e.target.value })} />
            <button type="button" className="btn-primary" onClick={saveRestaurant}>Create restaurant</button>
          </div>
        </div>
      </div>
    );
  }

  const isOnline = restaurant.online_status !== false && restaurant.accepting_orders !== false;
  const isOpen = dashboard?.is_open;

  return (
    <div className="restaurant-dashboard min-h-screen" style={{ "--primary": "#C6FF00", "--primary-hover": "#B0E600" }}>
      <IncomingOrderAlertBanner
        alert={alertBanner}
        onDismiss={dismissBanner}
        onView={handleViewOrder}
      />
      <Header />
      <div className="relative">
        <div
          className="h-40 md:h-52 bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(to bottom, transparent, var(--bg)), url(${restaurant.cover_url || FOOD_IMG})`,
          }}
        />
        <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-16 relative z-10 pb-16">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <img
              src={restaurant.image_url || FOOD_IMG}
              alt=""
              className="w-24 h-24 md:w-28 md:h-28 rounded-2xl object-cover border-4"
              style={{ borderColor: "var(--bg)" }}
            />
            <div className="flex-1">
              <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">{restaurant.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`badge ${isOpen ? "text-green-400" : "text-amber-400"}`}>
                  {isOpen ? "Open" : "Closed"}
                </span>
                <span className={`badge ${isOnline ? "" : "opacity-60"}`}>
                  <Power size={12} /> {isOnline ? "Online" : "Offline"}
                </span>
                <span className="badge flex items-center gap-1">
                  <Star size={12} /> {Number(restaurant.rating || 4.5).toFixed(1)}
                </span>
                <span className="badge flex items-center gap-1">
                  <Clock size={12} /> {restaurant.delivery_time_min || 30}m prep
                </span>
                <span
                  className="badge flex items-center gap-1"
                  style={{ color: livePulse > 0 ? "var(--primary)" : "var(--muted)" }}
                >
                  <Wifi size={12} /> Live{!alertsOnline ? " (offline queue)" : ""}
                </span>
                {unacknowledgedCount > 0 && (
                  <span className="badge ring-2 ring-[#C6FF00] font-bold" data-testid="unacknowledged-orders-badge">
                    {unacknowledgedCount} new
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={isOnline ? "btn-secondary text-sm" : "btn-primary text-sm"} onClick={toggleOnline}>
                <Power size={14} /> {isOnline ? "Go offline" : "Go online"}
              </button>
              <Link href="/restaurant/live-map" className="btn-secondary text-sm inline-flex items-center gap-1">
                <MapPin size={14} /> Live map
              </Link>
              <Link href="/restaurant/companion" className="btn-ghost text-sm inline-flex items-center gap-1">
                <Headphones size={14} /> Companion
              </Link>
              {permission !== "granted" ? (
                <button type="button" className="btn-ghost text-sm" onClick={() => { primeChime(); request(); }}>
                  {permission === "denied" ? <BellOff size={14} /> : <Bell size={14} />} Enable push
                </button>
              ) : (
                <button type="button" className="btn-ghost text-sm" onClick={() => { testAlertSound(); }}>
                  <Bell size={14} /> Test sound
                </button>
              )}
            </div>
          </div>

          {tab === "home" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
              {[
                { label: "Waiting", value: stats.orders_waiting ?? 0, icon: UtensilsCrossed },
                { label: "Preparing", value: stats.orders_preparing ?? 0, icon: ChefHat },
                { label: "Ready", value: stats.ready_for_pickup ?? 0, icon: Truck },
                { label: "Completed today", value: stats.completed_today ?? 0, icon: Star },
                { label: "Revenue today", value: `$${formatMoney(stats.revenue_today)}`, icon: DollarSign },
                { label: "Pending payout", value: `$${formatMoney(dashboard?.pending_payout)}`, icon: DollarSign },
                { label: "Active deliveries", value: dashboard?.active_deliveries ?? 0, icon: Truck },
                { label: "Rating", value: Number(restaurant.rating || 4.5).toFixed(1), icon: Star },
              ].map((tile) => (
                <motion.div key={tile.label} layout className="card p-4">
                  <tile.icon size={16} style={{ color: "var(--primary)" }} />
                  <div className="text-xs mt-2 uppercase tracking-wide" style={{ color: "var(--muted)" }}>{tile.label}</div>
                  <div className="font-display text-2xl font-bold mt-1">{tile.value}</div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="flex gap-1 mt-8 overflow-x-auto pb-2 border-b" style={{ borderColor: "var(--border)" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-3 py-2 text-sm font-bold whitespace-nowrap shrink-0 relative"
                style={{
                  color: tab === t.id ? "var(--text)" : "var(--muted)",
                  borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
                }}
              >
                {t.label}
                {t.id === "orders" && unacknowledgedCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: "#C6FF00", color: "#0A0A0A" }}
                  >
                    {unacknowledgedCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "home" && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-bold">Live orders</h2>
                <OrdersList
                  orders={sortedOrders.filter((o) => !["delivered", "cancelled"].includes(o.status)).slice(0, 5)}
                  busyOrder={busyOrder}
                  onStatusChange={updateOrderStatus}
                  isPulsing={isPulsing}
                  prepMinutes={prepMinutes}
                  highlightOrderId={highlightOrderId}
                  compact
                />
              </div>
            )}

            {tab === "orders" && (
              <OrdersList
                orders={sortedOrders}
                busyOrder={busyOrder}
                onStatusChange={updateOrderStatus}
                isPulsing={isPulsing}
                prepMinutes={prepMinutes}
                highlightOrderId={highlightOrderId}
              />
            )}

            {tab === "kitchen" && (
              <KitchenDisplaySystem orders={orders} busy={busyOrder} onStatusChange={updateOrderStatus} />
            )}

            {tab === "drivers" && (
              <DriverTrackingPanel logistics={logistics} approachAlerts={dashboard?.approach_alerts} />
            )}

            {tab === "analytics" && <RestaurantAnalyticsPanel />}

            {tab === "menu" && (
              <RestaurantMenuManager
                menu={menu}
                onAdd={addMenuItem}
                onUpdate={updateMenuItem}
                onDelete={deleteMenuItem}
                onDuplicate={duplicateMenuItem}
              />
            )}

            {tab === "store" && (
              <div className="space-y-6">
                <RestaurantStoreSettings restaurant={restaurant} onSave={saveStoreSettings} />
                <MerchantAlertSettingsPanel
                  settings={alertSettings}
                  onChange={updateAlertSettings}
                  onTest={testAlertSound}
                />
              </div>
            )}

            {tab === "messages" && <RestaurantMessaging />}

            {tab === "settlements" && (
              <div className="space-y-6">
                <div className="card p-4 max-w-md">
                  <div className="label-eyebrow">Wallet</div>
                  <div className="font-display text-2xl font-bold">${formatMoney(wallet.available)}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>Pending: ${formatMoney(wallet.pending)}</div>
                  <div className="flex gap-2 mt-3">
                    <input className="input-field" type="number" step="0.01" value={payoutAmt} onChange={(e) => setPayoutAmt(e.target.value)} />
                    <button type="button" className="btn-primary" onClick={doPayout}>Payout</button>
                  </div>
                </div>
                <VendorSettlementsPanel />
              </div>
            )}

            {tab === "companion" && <KitchenCompanion orders={orders} />}
            {tab === "community" && <VendorCommunityProfile />}
          </div>
        </div>
      </div>
      <FloatingMusicPlayer className="bottom-6" />
    </div>
  );
}

function OrdersList({ orders, busyOrder, onStatusChange, isPulsing, prepMinutes = 20, highlightOrderId, compact = false }) {
  const active = orders.filter((o) => o.status !== "cancelled");

  if (!active.length) {
    return <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>No active orders.</div>;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {active.map((o) => {
          const isNew = isIncomingUnacknowledged(o);
          const minsLeft = acceptMinutesRemaining(o, prepMinutes);
          const pulsing = isPulsing?.(o.order_id);
          return (
          <motion.div
            key={o.order_id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{
              opacity: 1,
              y: 0,
              boxShadow: pulsing ? ["0 0 0 0 rgba(198,255,0,0.4)", "0 0 0 8px rgba(198,255,0,0)"] : undefined,
            }}
            transition={pulsing ? { repeat: Infinity, duration: 1.6 } : undefined}
            exit={{ opacity: 0 }}
            className="card p-5"
            style={{
              borderColor: highlightOrderId === o.order_id || pulsing ? "#C6FF00" : undefined,
              borderWidth: highlightOrderId === o.order_id || pulsing ? 2 : undefined,
            }}
            data-testid={`incoming-order-${o.order_id}`}
          >
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <div className="font-display text-lg font-bold flex items-center gap-2 flex-wrap">
                  {o.customer_name}
                  {isNew && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse" style={{ background: "#C6FF00", color: "#0A0A0A" }}>
                      NEW
                    </span>
                  )}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  #{String(o.order_id).slice(-8).toUpperCase()} · {o.delivery_type || "delivery"} · ${formatMoney(o.total)}
                </div>
                {isNew && (
                  <div className="text-xs mt-1 font-bold" style={{ color: "#C6FF00" }}>
                    Accept within {minsLeft} min
                  </div>
                )}
                <div className="mt-2 text-sm">
                  {(o.items || []).map((it, i) => (
                    <div key={i}>{it.quantity}× {it.name}</div>
                  ))}
                </div>
                {(o.special_instructions || o.delivery_instructions || o.notes) && (
                  <div className="text-xs mt-2 italic" style={{ color: "var(--warning)" }}>
                    {o.special_instructions || o.delivery_instructions || o.notes}
                  </div>
                )}
                {o.driver_id && (
                  <div className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    <Truck size={12} /> Driver assigned
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="badge capitalize">{o.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            {isPaymentConfirmed(o) && (STATUS_ACTIONS[o.status] || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {STATUS_ACTIONS[o.status].map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    className={action.primary ? "btn-primary !py-2 text-sm" : "btn-ghost text-sm"}
                    disabled={busyOrder === o.order_id}
                    onClick={() => onStatusChange(o.order_id, action.status)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            {!compact && isPaymentConfirmed(o) && <VendorOrderPricing orderId={o.order_id} />}
          </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function DriverTrackingPanel({ logistics, approachAlerts }) {
  const activeOrders = logistics?.active_orders || [];

  return (
    <div className="space-y-4">
      {(approachAlerts || []).map((a) => (
        <div key={`${a.order_id}-${a.message}`} className="card p-4 ring-2" style={{ borderColor: "var(--primary)" }}>
          <div className="font-bold text-sm">{a.message}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Driver arrival notification</div>
        </div>
      ))}
      <div className="grid md:grid-cols-2 gap-4">
        {activeOrders.map((o) => (
          <div key={o.order_id} className="card p-4">
            <div className="flex justify-between gap-2">
              <div>
                <div className="font-bold">{o.customer_name}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  {o.driver_name} · {o.vehicle_type || "Vehicle"}
                </div>
              </div>
              <span className="badge capitalize">{o.live_status}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              {o.eta_pickup_min != null && <span className="badge">ETA {o.eta_pickup_min}m</span>}
              {o.driver_distance_feet != null && <span className="badge">{o.driver_distance_feet} ft away</span>}
              <span className="badge">GPS {o.driver_lat != null ? "active" : "pending"}</span>
            </div>
          </div>
        ))}
      </div>
      {!activeOrders.length && (
        <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>No drivers assigned to active orders.</div>
      )}
    </div>
  );
}
