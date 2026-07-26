"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Store,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney, sanitizeOrders } from "@/lib/safeData";
import { isPaymentConfirmed } from "@/lib/orderState";
import { acceptMinutesRemaining, isIncomingUnacknowledged } from "@/lib/merchant/incomingOrderAlerts";
import { useMerchantIncomingOrderAlerts } from "@/lib/hooks/useMerchantIncomingOrderAlerts";
import IncomingOrderAlertBanner from "@/components/merchant/IncomingOrderAlertBanner";
import MerchantAlertSettingsPanel from "@/components/merchant/MerchantAlertSettingsPanel";
import { useWebPush } from "@/lib/useWebPush";
import { primeChime } from "@/lib/chime";

const STATUS_NEXT = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
};

const STATUS_LABELS = {
  placed: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  assigned_internal: "Driver Assigned",
  picked_up: "Out for Delivery",
  delivered: "Completed",
  cancelled: "Rejected",
};

function StatusBadge({ status }) {
  const colors = {
    placed: "#fbbf24",
    accepted: "#60a5fa",
    preparing: "#a78bfa",
    ready: "#4ade80",
    assigned_internal: "#22d3ee",
    picked_up: "#f472b6",
    delivered: "#4ade80",
    cancelled: "#f87171",
  };
  return (
    <span
      className="text-xs font-bold px-2 py-1 rounded-full"
      style={{ background: `${colors[status] || "#94a3b8"}22`, color: colors[status] || "#94a3b8" }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function TestRestaurantDashboard() {
  const [orders, setOrders] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [dataPrimed, setDataPrimed] = useState(false);
  const { fire, request, permission } = useWebPush("ZoomEats Sandbox Merchant");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/admin/restaurant-simulator/dashboard");
      const data = res?.data || res;
      setRestaurant(data?.restaurant || null);
      setOrders(sanitizeOrders(data?.orders));
      setDataPrimed(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const {
    settings: alertSettings,
    updateSettings: updateAlertSettings,
    testSound,
    banner,
    dismissBanner,
    unacknowledgedCount,
    sortedOrders,
    isPulsing,
  } = useMerchantIncomingOrderAlerts({
    merchantId: restaurant?.restaurant_id,
    sandbox: true,
    orders,
    prepMinutes: 20,
    primed: dataPrimed,
    onPush: fire,
    onViewOrder: dismissBanner,
  });

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const updateStatus = async (orderId, status) => {
    setBusy(orderId);
    try {
      await api.post(`/admin/restaurant-simulator/orders/${orderId}/status`, { status });
      if (status === "accepted" || status === "cancelled") dismissBanner(orderId);
      await load();
    } catch (e) {
      alert(e?.message || "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const advance = (order) => {
    const next = STATUS_NEXT[order.status];
    if (next) updateStatus(order.order_id, next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm" style={{ color: "var(--muted)" }}>
        <Loader2 className="animate-spin mr-2" size={18} /> Loading test kitchen...
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="card p-8 text-center">
        <ChefHat size={40} className="mx-auto mb-4" style={{ color: "var(--muted)" }} />
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Test kitchen not set up yet. Go back and run setup first.
        </p>
        <Link href="/admin/restaurant-simulator" className="btn-primary inline-block mt-4 text-sm">
          Restaurant Simulator
        </Link>
      </div>
    );
  }

  const incoming = sortedOrders.filter((o) => ["placed", "accepted", "preparing", "ready"].includes(o.status));

  return (
    <div className="space-y-6">
      <IncomingOrderAlertBanner alert={banner} onDismiss={dismissBanner} onView={dismissBanner} />

      <div className="card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            <Store size={14} /> Sandbox merchant · {restaurant.merchant_category_slug || "restaurants"}
          </div>
          <h2 className="font-display text-2xl font-bold mt-1">{restaurant.name}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {restaurant.address} · {restaurant.phone || "Test Number"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permission !== "granted" && (
            <button type="button" className="btn-ghost text-sm" onClick={() => { primeChime(); request(); }}>
              Enable push
            </button>
          )}
          <button type="button" className="btn-ghost text-sm" onClick={testSound}>Test sound</button>
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Unacknowledged</div>
          <div className="text-3xl font-bold mt-1" style={{ color: unacknowledgedCount ? "#C6FF00" : undefined }}>{unacknowledgedCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Incoming queue</div>
          <div className="text-3xl font-bold mt-1">{incoming.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Active orders</div>
          <div className="text-3xl font-bold mt-1">{orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Completed</div>
          <div className="text-3xl font-bold mt-1">{orders.filter((o) => o.status === "delivered").length}</div>
        </div>
      </div>

      <MerchantAlertSettingsPanel
        settings={alertSettings}
        onChange={updateAlertSettings}
        onTest={testSound}
      />

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <UtensilsCrossed size={18} />
          <h3 className="font-bold">Incoming Orders</h3>
          {unacknowledgedCount > 0 && (
            <span className="badge" style={{ background: "#C6FF00", color: "#0A0A0A" }}>{unacknowledgedCount} new</span>
          )}
        </div>

        {sortedOrders.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
            No test orders yet. Create one from the simulator home page.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedOrders.map((order) => {
              const isNew = isIncomingUnacknowledged(order);
              const pulsing = isPulsing(order.order_id);
              return (
              <div
                key={order.order_id}
                className={`p-4 rounded-xl ${pulsing ? "animate-pulse" : ""}`}
                style={{
                  background: "var(--surface-2)",
                  border: pulsing ? "2px solid #C6FF00" : "2px solid transparent",
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {order.customer_name}
                      {isNew && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#C6FF00", color: "#0A0A0A" }}>NEW</span>}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      #{String(order.order_id).slice(-8).toUpperCase()} · ${formatMoney(order.total)}
                    </div>
                    {isNew && (
                      <div className="text-xs mt-1 font-bold" style={{ color: "#C6FF00" }}>
                        Accept within {acceptMinutesRemaining(order)} min
                      </div>
                    )}
                    <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                      <Clock size={12} /> {new Date(order.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-3 text-sm">
                  {(order.items || []).map((item, i) => (
                    <div key={i}>{item.quantity}× {item.name}</div>
                  ))}
                </div>
                <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  {order.address}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {order.status === "placed" && isPaymentConfirmed(order) && (
                    <>
                      <button
                        type="button"
                        className="btn-primary text-sm inline-flex items-center gap-1"
                        disabled={busy === order.order_id}
                        onClick={() => advance(order)}
                      >
                        <CheckCircle2 size={14} /> Accept Order
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-sm inline-flex items-center gap-1"
                        disabled={busy === order.order_id}
                        onClick={() => updateStatus(order.order_id, "cancelled")}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </>
                  )}
                  {STATUS_NEXT[order.status] && order.status !== "placed" && (
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={busy === order.order_id}
                      onClick={() => advance(order)}
                    >
                      Mark as {STATUS_LABELS[STATUS_NEXT[order.status]]}
                    </button>
                  )}
                  {order.driver_id && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--surface-3)" }}>
                      Driver: {String(order.driver_id).slice(-8)}
                    </span>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
