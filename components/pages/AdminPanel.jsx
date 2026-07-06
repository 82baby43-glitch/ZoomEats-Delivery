"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import PulseHeader, { MetricsTiles } from "@/components/admin/PulseHeader";
import DigestCard from "@/components/admin/DigestCard";
import AttentionSummary from "@/components/admin/AttentionSummary";
import ActivityFeed from "@/components/admin/ActivityFeed";
import AttentionTab from "@/components/admin/AttentionTab";
import { UsersTable, RestaurantsList, OrdersTable } from "@/components/admin/Tables";
import { sanitizeActivity, sanitizeAttention, sanitizeMetrics, sanitizeOrders, sanitizeRestaurants, sanitizeUsers } from "@/lib/safeData";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { logClientError } from "@/lib/clientErrorLog";

const EMPTY_ATTENTION = sanitizeAttention(null);

export default function AdminPanel() {
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activity, setActivity] = useState([]);
  const [attention, setAttention] = useState(EMPTY_ATTENTION);
  const [digest, setDigest] = useState(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [tab, setTab] = useState("pulse");
  const [since, setSince] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadFast = useCallback(async () => {
    try {
      const [m, a, at] = await Promise.all([
        api.get("/admin/metrics"),
        api.get("/admin/activity"),
        api.get("/admin/attention"),
      ]);
      setMetrics(sanitizeMetrics(m?.data));
      setActivity(sanitizeActivity(a?.data));
      setAttention(sanitizeAttention(at?.data));
      setSince(0);
      setLoadError(false);
    } catch (e) {
      logClientError("admin.loadFast", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFull = useCallback(async () => {
    try {
      const [u, r, o] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/restaurants"),
        api.get("/admin/orders"),
      ]);
      setUsers(sanitizeUsers(u?.data));
      setRestaurants(sanitizeRestaurants(r?.data));
      setOrders(sanitizeOrders(o?.data));
    } catch (e) {
      logClientError("admin.loadFull", e);
    }
  }, []);

  useEffect(() => {
    loadFast();
    loadFull();
  }, [loadFast, loadFull]);

  useEffect(() => {
    const a = setInterval(loadFast, 8000);
    const b = setInterval(() => setSince((s) => s + 1), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [loadFast]);

  const fetchDigest = async () => {
    setDigestLoading(true);
    try {
      const r = await api.get("/admin/digest");
      setDigest(r?.data && typeof r.data === "object" ? r.data : null);
    } catch (e) {
      logClientError("admin.digest", e);
    } finally {
      setDigestLoading(false);
    }
  };

  const approve = async (rid) => {
    if (!rid) return;
    try {
      await api.post(`/admin/restaurants/${rid}/approve`);
      await Promise.all([loadFast(), loadFull()]);
    } catch (e) {
      logClientError("admin.approve", e);
    }
  };

  const counts = attention?.counts ?? { pending: 0, stuck: 0, failed: 0 };
  const totalAttention = counts.pending + counts.stuck + counts.failed;

  const tabs = [
    { id: "pulse", label: "Pulse" },
    { id: "attention", label: `Attention${totalAttention ? ` · ${totalAttention}` : ""}` },
    { id: "users", label: "Users" },
    { id: "restaurants", label: "Restaurants" },
    { id: "orders", label: "Orders" },
  ];

  const retryAll = () => {
    setLoading(true);
    setLoadError(false);
    loadFast();
    loadFull();
  };

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <PulseHeader since={since} onRefresh={retryAll} />
        <div className="mt-4">
          <Link
            href="/admin/import-restaurants"
            className="btn-ghost inline-flex items-center gap-2 text-sm"
            data-testid="admin-import-link"
          >
            <Download size={16} /> Google Places Bulk Import
          </Link>
        </div>
        <MetricsTiles metrics={metrics} loading={loading} />

        {loadError && !metrics && (
          <div className="mt-6">
            <ErrorState
              title="Could not load admin data"
              description="The dashboard will keep retrying. You can also refresh manually."
              onRetry={retryAll}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-8 border-b" style={{ borderColor: "var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
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
          {loading && tab !== "pulse" ? (
            <LoadingSkeleton label="Loading…" />
          ) : (
            <>
              {tab === "pulse" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <DigestCard digest={digest} loading={digestLoading} onGenerate={fetchDigest} />
                  <AttentionSummary counts={counts} onResolve={() => setTab("attention")} />
                  <ActivityFeed events={activity} />
                </div>
              )}
              {tab === "attention" && <AttentionTab attention={attention} onApprove={approve} />}
              {tab === "users" && <UsersTable users={users} />}
              {tab === "restaurants" && <RestaurantsList restaurants={restaurants} onApprove={approve} />}
              {tab === "orders" && <OrdersTable orders={orders} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
