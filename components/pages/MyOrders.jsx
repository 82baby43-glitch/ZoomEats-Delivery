"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { Clock, CheckCircle2 } from "lucide-react";

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
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/orders/my");
        setOrders(r.data);
      } catch {
        router.push("/");
      }
    })();
  }, [navigate]);

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
        <h1 className="font-display text-4xl font-black tracking-tighter mb-8">Your orders</h1>
        {orders.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="mb-4">No orders yet.</p>
            <Link href="/" className="btn-primary">Browse restaurants</Link>
          </div>
        ) : (
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
                    {o.items.length} items · ${o.total.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge">
                    {o.status === "delivered" ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    {STATUS_LABEL[o.status] || o.status}
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
