import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import {
  Sparkles, AlertTriangle, ShoppingBag, UserPlus, Store, Activity, Loader2, RefreshCw, Clock,
} from "lucide-react";

const TYPE_META = {
  order:      { icon: ShoppingBag, color: "var(--primary)" },
  signup:     { icon: UserPlus,    color: "#7DD3FC" },
  restaurant: { icon: Store,       color: "#FBBF24" },
};

function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminPanel() {
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activity, setActivity] = useState([]);
  const [attention, setAttention] = useState({ pending_restaurants: [], stuck_orders: [], failed_payments: [], counts: { pending: 0, stuck: 0, failed: 0 } });
  const [digest, setDigest] = useState(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [tab, setTab] = useState("pulse");
  const [pulseSinceRefresh, setPulseSinceRefresh] = useState(0);

  const loadFast = useCallback(async () => {
    const [m, a, at] = await Promise.all([
      api.get("/admin/metrics"),
      api.get("/admin/activity"),
      api.get("/admin/attention"),
    ]);
    setMetrics(m.data);
    setActivity(a.data);
    setAttention(at.data);
    setPulseSinceRefresh(0);
  }, []);

  const loadFull = useCallback(async () => {
    const [u, r, o] = await Promise.all([
      api.get("/admin/users"),
      api.get("/admin/restaurants"),
      api.get("/admin/orders"),
    ]);
    setUsers(u.data);
    setRestaurants(r.data);
    setOrders(o.data);
  }, []);

  useEffect(() => {
    loadFast();
    loadFull();
  }, [loadFast, loadFull]);

  // Auto-refresh pulse data every 8s
  useEffect(() => {
    const t = setInterval(() => { loadFast(); }, 8000);
    const tick = setInterval(() => setPulseSinceRefresh((s) => s + 1), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [loadFast]);

  const fetchDigest = async () => {
    setDigestLoading(true);
    try {
      const r = await api.get("/admin/digest");
      setDigest(r.data);
    } finally {
      setDigestLoading(false);
    }
  };

  const approve = async (rid) => {
    await api.post(`/admin/restaurants/${rid}/approve`);
    await Promise.all([loadFast(), loadFull()]);
  };

  const totalAttention = attention.counts.pending + attention.counts.stuck + attention.counts.failed;

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
          <div>
            <div className="label-eyebrow">Platform · Live pulse</div>
            <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Admin panel</h1>
          </div>
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }} data-testid="pulse-status">
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: "var(--primary)" }}
            />
            Live · refreshed {pulseSinceRefresh}s ago
            <button className="btn-ghost !p-2" onClick={loadFast} data-testid="manual-refresh"><RefreshCw size={16} /></button>
          </div>
        </div>

        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6" data-testid="admin-metrics">
            {[
              ["Users", metrics.users],
              ["Restaurants", metrics.restaurants],
              ["Orders", metrics.orders],
              ["Paid", metrics.paid_orders],
              ["Revenue", `$${metrics.revenue.toFixed(2)}`],
            ].map(([label, v]) => (
              <motion.div
                key={label}
                className="card p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="label-eyebrow">{label}</div>
                <div className="font-display text-2xl md:text-3xl font-black mt-1">{v}</div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-8 border-b" style={{ borderColor: "var(--border)" }}>
          {[
            { id: "pulse", label: "Pulse" },
            { id: "attention", label: `Attention${totalAttention ? ` · ${totalAttention}` : ""}` },
            { id: "users", label: "Users" },
            { id: "restaurants", label: "Restaurants" },
            { id: "orders", label: "Orders" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 capitalize font-bold flex items-center gap-2"
              style={{
                color: tab === t.id ? "var(--text)" : "var(--muted)",
                borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
              }}
              data-testid={`admin-tab-${t.id}`}
            >
              {t.label}
              {t.id === "attention" && totalAttention > 0 && (
                <span
                  className="text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center"
                  style={{ background: "var(--primary)", color: "#0A0A0A" }}
                  data-testid="attention-badge"
                >
                  {totalAttention}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "pulse" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Digest */}
              <div className="card p-6 lg:col-span-2" data-testid="digest-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} style={{ color: "var(--primary)" }} />
                    <h3 className="font-display text-xl font-bold">Today's digest by Zoey</h3>
                  </div>
                  <button
                    className="btn-secondary !py-2 !px-3 flex items-center gap-2 text-sm"
                    onClick={fetchDigest}
                    disabled={digestLoading}
                    data-testid="generate-digest"
                  >
                    {digestLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {digest ? "Regenerate" : "Generate"}
                  </button>
                </div>
                {!digest && !digestLoading && (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Click "Generate" for an AI summary of today's platform activity (orders, GMV, top performers, items needing attention).
                  </p>
                )}
                {digestLoading && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
                    <Loader2 size={14} className="animate-spin" /> Asking Claude…
                  </div>
                )}
                {digest && (
                  <>
                    <p className="leading-relaxed" data-testid="digest-text">{digest.digest}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                      {[
                        ["Orders", digest.stats.orders],
                        ["Paid", digest.stats.paid_orders],
                        ["GMV", `$${digest.stats.gmv.toFixed(2)}`],
                        ["New restaurants", digest.stats.new_restaurants],
                      ].map(([l, v]) => (
                        <div key={l} style={{ background: "var(--surface-2)" }} className="rounded-lg p-3">
                          <div className="label-eyebrow">{l}</div>
                          <div className="font-display text-lg font-black mt-1">{v}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Attention summary */}
              <div className="card p-6" data-testid="attention-summary">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} style={{ color: totalAttention > 0 ? "var(--primary)" : "var(--muted)" }} />
                  <h3 className="font-display text-xl font-bold">Needs attention</h3>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span style={{ color: "var(--muted)" }}>Pending restaurant approvals</span><span className="font-bold">{attention.counts.pending}</span></li>
                  <li className="flex justify-between"><span style={{ color: "var(--muted)" }}>Stuck orders (&gt; 30 min)</span><span className="font-bold">{attention.counts.stuck}</span></li>
                  <li className="flex justify-between"><span style={{ color: "var(--muted)" }}>Failed payments</span><span className="font-bold">{attention.counts.failed}</span></li>
                </ul>
                {totalAttention > 0 && (
                  <button className="btn-primary w-full mt-4 !py-2" onClick={() => setTab("attention")} data-testid="goto-attention">
                    Resolve {totalAttention} item{totalAttention === 1 ? "" : "s"}
                  </button>
                )}
                {totalAttention === 0 && (
                  <div className="mt-4 text-sm font-bold" style={{ color: "var(--primary)" }}>
                    All clear ✓
                  </div>
                )}
              </div>

              {/* Live activity feed */}
              <div className="card p-6 lg:col-span-3" data-testid="activity-feed">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={18} style={{ color: "var(--primary)" }} />
                  <h3 className="font-display text-xl font-bold">Live activity</h3>
                  <span className="label-eyebrow">last {activity.length}</span>
                </div>
                <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
                  <AnimatePresence initial={false}>
                    {activity.map((e) => {
                      const meta = TYPE_META[e.type] || TYPE_META.order;
                      const Icon = meta.icon;
                      return (
                        <motion.li
                          key={`${e.type}-${e.id}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-start gap-3 p-3 rounded-lg"
                          style={{ background: "var(--surface-2)" }}
                          data-testid={`event-${e.type}-${e.id}`}
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: meta.color, color: "#0A0A0A" }}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm">{e.title}</div>
                            <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{e.description}</div>
                          </div>
                          <div className="text-xs whitespace-nowrap flex items-center gap-1" style={{ color: "var(--muted)" }}>
                            <Clock size={12} /> {timeAgo(e.when)}
                          </div>
                        </motion.li>
                      );
                    })}
                    {activity.length === 0 && (
                      <li className="text-center py-10" style={{ color: "var(--muted)" }}>No events yet.</li>
                    )}
                  </AnimatePresence>
                </ul>
              </div>
            </div>
          )}

          {tab === "attention" && (
            <div className="space-y-6">
              <div className="card p-6" data-testid="pending-approvals">
                <h3 className="font-display text-xl font-bold mb-3">Pending restaurant approvals · {attention.counts.pending}</h3>
                {attention.pending_restaurants.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>None right now.</p>
                ) : (
                  <div className="space-y-3">
                    {attention.pending_restaurants.map((r) => (
                      <div key={r.restaurant_id} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                        <img src={r.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                        <div className="flex-1">
                          <div className="font-bold">{r.name}</div>
                          <div className="text-sm" style={{ color: "var(--muted)" }}>{r.cuisine} · {r.address}</div>
                        </div>
                        <button className="btn-primary !py-2" onClick={() => approve(r.restaurant_id)} data-testid={`approve-${r.restaurant_id}`}>
                          Approve
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-6" data-testid="stuck-orders">
                <h3 className="font-display text-xl font-bold mb-3">Stuck orders · {attention.counts.stuck}</h3>
                {attention.stuck_orders.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>None — all paid orders are progressing on time.</p>
                ) : (
                  <div className="space-y-2">
                    {attention.stuck_orders.map((o) => (
                      <div key={o.order_id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                        <div>
                          <div className="font-bold">${o.total.toFixed(2)} · {o.restaurant_name}</div>
                          <div className="text-sm" style={{ color: "var(--muted)" }}>{o.customer_name} · {o.status} · {timeAgo(o.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-6" data-testid="failed-payments">
                <h3 className="font-display text-xl font-bold mb-3">Failed payments · {attention.counts.failed}</h3>
                {attention.failed_payments.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>None.</p>
                ) : (
                  <div className="space-y-2">
                    {attention.failed_payments.map((p) => (
                      <div key={p.session_id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                        <div>
                          <div className="font-bold">${(p.amount || 0).toFixed(2)} · {p.user_id}</div>
                          <div className="text-sm" style={{ color: "var(--muted)" }}>{p.payment_status} · {timeAgo(p.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
