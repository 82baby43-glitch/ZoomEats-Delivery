import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";

export default function AdminPanel() {
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("overview");

  const load = async () => {
    const m = await api.get("/admin/metrics");
    setMetrics(m.data);
    const u = await api.get("/admin/users");
    setUsers(u.data);
    const r = await api.get("/admin/restaurants");
    setRestaurants(r.data);
    const o = await api.get("/admin/orders");
    setOrders(o.data);
  };

  useEffect(() => { load(); }, []);

  const approve = async (rid) => {
    await api.post(`/admin/restaurants/${rid}/approve`);
    await load();
  };

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <h1 className="font-display text-4xl font-black tracking-tighter">Admin panel</h1>

        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6" data-testid="admin-metrics">
            {[
              ["Users", metrics.users],
              ["Restaurants", metrics.restaurants],
              ["Orders", metrics.orders],
              ["Paid", metrics.paid_orders],
              ["Revenue", `$${metrics.revenue.toFixed(2)}`],
            ].map(([label, v]) => (
              <div key={label} className="card p-5">
                <div className="label-eyebrow">{label}</div>
                <div className="font-display text-2xl md:text-3xl font-black mt-1">{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-8 border-b" style={{ borderColor: "var(--border)" }}>
          {["overview", "users", "restaurants", "orders"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 capitalize font-bold"
              style={{
                color: tab === t ? "var(--text)" : "var(--muted)",
                borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
              }}
              data-testid={`admin-tab-${t}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "overview" && (
            <div className="card p-6">
              <p style={{ color: "var(--muted)" }}>
                Use the tabs above to manage users, approve restaurants, or review orders.
              </p>
            </div>
          )}
          {tab === "users" && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--surface-2)" }}>
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-3 font-bold">{u.name}</td>
                      <td className="p-3">{u.email}</td>
                      <td className="p-3"><span className="badge">{u.role}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === "restaurants" && (
            <div className="space-y-3">
              {restaurants.map((r) => (
                <div key={r.restaurant_id} className="card p-4 flex items-center gap-4" data-testid={`admin-rest-${r.restaurant_id}`}>
                  <img src={r.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-1">
                    <div className="font-bold">{r.name}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>{r.cuisine} · {r.address}</div>
                  </div>
                  {r.approved ? (
                    <span className="badge">Approved</span>
                  ) : (
                    <button className="btn-primary !py-2" onClick={() => approve(r.restaurant_id)} data-testid={`approve-${r.restaurant_id}`}>
                      Approve
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {tab === "orders" && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--surface-2)" }}>
                  <tr>
                    <th className="text-left p-3">Order</th>
                    <th className="text-left p-3">Restaurant</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.order_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-3 font-mono">#{o.order_id.slice(-6)}</td>
                      <td className="p-3">{o.restaurant_name}</td>
                      <td className="p-3">{o.customer_name}</td>
                      <td className="p-3 text-right font-bold">${o.total.toFixed(2)}</td>
                      <td className="p-3"><span className="badge">{o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
