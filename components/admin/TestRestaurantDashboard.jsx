"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { playChime } from "@/lib/chime";

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
  const notifiedRef = useRef(new Set());
  const primedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/admin/restaurant-simulator/dashboard");
      const data = res?.data || res;
      setRestaurant(data?.restaurant || null);
      const orderList = sanitizeOrders(data?.orders);
      setOrders(orderList);

      const fresh = orderList.filter(
        (o) => o.status === "placed" && isPaymentConfirmed(o) && !notifiedRef.current.has(o.order_id)
      );
      if (primedRef.current && fresh.length > 0) {
        playChime();
      }
      orderList.forEach((o) => {
        if (o.status === "placed") notifiedRef.current.add(o.order_id);
      });
      primedRef.current = true;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const updateStatus = async (orderId, status) => {
    setBusy(orderId);
    try {
      await api.post(`/admin/restaurant-simulator/orders/${orderId}/status`, { status });
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

  const incoming = orders.filter((o) => ["placed", "accepted", "preparing", "ready"].includes(o.status));

  return (
    <div className="space-y-6">
      <div className="card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            <Store size={14} /> Test Restaurant Mode
          </div>
          <h2 className="font-display text-2xl font-bold mt-1">{restaurant.name}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {restaurant.address} · {restaurant.phone || "Test Number"}
          </p>
        </div>
        <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
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

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <UtensilsCrossed size={18} />
          <h3 className="font-bold">Incoming Orders</h3>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
            No test orders yet. Create one from the simulator home page.
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.order_id} className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{order.customer_name}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      #{String(order.order_id).slice(-8).toUpperCase()} · ${formatMoney(order.total)}
                    </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
