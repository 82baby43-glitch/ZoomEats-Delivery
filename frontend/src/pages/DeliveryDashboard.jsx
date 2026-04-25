import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";

export default function DeliveryDashboard() {
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);

  const load = async () => {
    const a = await api.get("/delivery/available");
    setAvailable(a.data);
    const m = await api.get("/delivery/my");
    setMine(m.data);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const action = async (oid, act) => {
    await api.post(`/delivery/orders/${oid}/${act}`);
    await load();
  };

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
        <h1 className="font-display text-4xl font-black tracking-tighter">Delivery dashboard</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>Pick up & complete deliveries.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="card p-5">
            <div className="label-eyebrow">Active deliveries</div>
            <div className="font-display text-3xl font-black mt-1">{mine.filter((o) => o.status !== "delivered").length}</div>
          </div>
          <div className="card p-5">
            <div className="label-eyebrow">Completed today</div>
            <div className="font-display text-3xl font-black mt-1">{mine.filter((o) => o.status === "delivered").length}</div>
          </div>
          <div className="card p-5">
            <div className="label-eyebrow">Available now</div>
            <div className="font-display text-3xl font-black mt-1" data-testid="available-count">{available.length}</div>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="font-display text-2xl font-bold mb-4">Available orders</h2>
          {available.length === 0 ? (
            <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>
              No orders ready for pickup right now.
            </div>
          ) : (
            <div className="space-y-3">
              {available.map((o) => (
                <div key={o.order_id} className="card p-5 flex items-center justify-between" data-testid={`avail-${o.order_id}`}>
                  <div>
                    <div className="font-bold">{o.restaurant_name}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>To: {o.address} · ${o.total.toFixed(2)}</div>
                  </div>
                  <button className="btn-primary !py-2" onClick={() => action(o.order_id, "accept")} data-testid={`accept-${o.order_id}`}>
                    Accept pickup
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10">
          <h2 className="font-display text-2xl font-bold mb-4">Your deliveries</h2>
          {mine.length === 0 ? (
            <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>None yet.</div>
          ) : (
            <div className="space-y-3">
              {mine.map((o) => (
                <div key={o.order_id} className="card p-5 flex items-center justify-between" data-testid={`mine-${o.order_id}`}>
                  <div>
                    <div className="font-bold">{o.restaurant_name}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>{o.address}</div>
                    <div className="badge mt-2">{o.status}</div>
                  </div>
                  {o.status === "picked_up" && (
                    <button className="btn-primary !py-2" onClick={() => action(o.order_id, "deliver")} data-testid={`deliver-${o.order_id}`}>
                      Mark delivered
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
