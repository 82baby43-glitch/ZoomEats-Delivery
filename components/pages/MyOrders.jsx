"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { safeGet } from "@/lib/api";
import Header from "@/components/Header";
import { Clock, CheckCircle2 } from "lucide-react";
import { formatMoney, sanitizeOrders } from "@/lib/safeData";
import { isPaymentConfirmed } from "@/lib/orderState";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready for pickup",
  picked_up: "Out for delivery",
  delivered: "Delivered",
};

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await safeGet("/orders/my", []);
      setOrders(sanitizeOrders(data));
    } catch (e) {
      logClientError("orders.my", e);
      setError(true);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
        <h1 className="font-display text-4xl font-black tracking-tighter mb-8">Your orders</h1>

        {loading && <LoadingSkeleton label="Loading your orders…" rows={3} />}

        {!loading && error && (
          <ErrorState
            title="Could not load orders"
            description="Check your connection and try again."
            onRetry={load}
          />
        )}

        {!loading && !error && orders.length === 0 && (
          <EmptyState
            title="No orders yet"
            description="When you place an order, it will show up here."
            action={<Link href="/" className="btn-primary mt-4 inline-block">Browse restaurants</Link>}
          />
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((o) => (
              <Link
                key={o.order_id}
                href={`/orders/${o.order_id}`}
                className="card card-hover p-5 flex items-center justify-between gap-4"
                data-testid={`order-row-${o.order_id}`}
              >
                <div>
                  <div className="font-display text-lg font-bold">{o.restaurant_name}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    {(o.items || []).length} items · ${formatMoney(o.total)}
                    {!isPaymentConfirmed(o) && " · Payment pending"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge">
                    {o.status === "delivered" ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    {STATUS_LABEL[o.status] || o.status || "Unknown"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
