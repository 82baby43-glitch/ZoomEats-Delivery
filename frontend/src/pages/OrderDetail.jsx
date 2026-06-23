import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { CheckCircle2, Circle } from "lucide-react";

const TIMELINE = [
  { id: "placed", label: "Placed" },
  { id: "accepted", label: "Accepted" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready for pickup" },
  { id: "picked_up", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
];

export default function OrderDetail() {
  const { oid } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.get(`/orders/${oid}`);
        if (!cancelled) setOrder(r.data);
      } catch (e) {
        if (!cancelled) console.warn("[order-detail] poll failed:", e);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [oid]);

  if (!order) return <div><Header /><div className="p-12 text-center">Loading…</div></div>;

  const idx = TIMELINE.findIndex((t) => t.id === order.status);

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <div className="label-eyebrow">Order #{order.order_id.slice(-6)}</div>
        <h1 className="font-display text-4xl font-black tracking-tighter mt-1">{order.restaurant_name}</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          {order.address} · ${order.total.toFixed(2)} · {order.payment_status}
        </p>

        <div className="card p-6 mt-8">
          <h3 className="font-display text-xl font-bold mb-4">Status</h3>
          <ol className="space-y-3" data-testid="order-timeline">
            {TIMELINE.map((t, i) => {
              const done = i <= idx && order.status !== "pending_payment";
              return (
                <li key={t.id} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 size={20} style={{ color: "var(--accent)" }} />
                  ) : (
                    <Circle size={20} style={{ color: "var(--border)" }} />
                  )}
                  <span className={done ? "font-bold" : ""} style={{ color: done ? "var(--text)" : "var(--muted)" }}>
                    {t.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="card p-6 mt-6">
          <h3 className="font-display text-xl font-bold mb-4">Items</h3>
          {order.items.map((it) => (
            <div key={it.item_id} className="flex justify-between py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <span>{it.quantity}× {it.name}</span>
              <span>${(it.price * it.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between mt-4 font-display font-bold text-lg">
            <span>Total</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
