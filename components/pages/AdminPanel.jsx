"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
<<<<<<< HEAD
import { Download, Truck, CreditCard, MapPin, Activity, DollarSign, Sparkles, Shield, Store, Calculator, Percent, SlidersHorizontal, BarChart3 } from "lucide-react";
=======
import { Download, Truck, CreditCard, MapPin, Activity, DollarSign, Sparkles, Shield, Store, Calculator, BarChart3, Brain } from "lucide-react";
>>>>>>> origin/cursor/ai-pricing-optimizer-b576
import { api } from "@/lib/api";
import Header from "@/components/Header";
import PulseHeader, { MetricsTiles } from "@/components/admin/PulseHeader";
import DigestCard from "@/components/admin/DigestCard";
import AttentionSummary from "@/components/admin/AttentionSummary";
import ActivityFeed from "@/components/admin/ActivityFeed";
import AttentionTab from "@/components/admin/AttentionTab";
import ApprovalsTab from "@/components/admin/ApprovalsTab";
import PartnerApprovalsPanel from "@/components/admin/PartnerApprovalsPanel";
import ComplianceDossier from "@/components/admin/ComplianceDossier";
import GeocodeRestaurantsButton from "@/components/admin/GeocodeRestaurantsButton";
import RestaurantLocationEditor from "@/components/admin/RestaurantLocationEditor";
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
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingDrivers, setPendingDrivers] = useState(0);
  const [dossierUserId, setDossierUserId] = useState(null);
  const [locationRestaurantId, setLocationRestaurantId] = useState(null);

  const loadApprovals = useCallback(async () => {
    try {
      const [pending, drivers] = await Promise.all([
        api.get("/admin/approvals/pending"),
        api.get("/admin/approvals/drivers", { params: { status: "pending" } }),
      ]);
      const pendingList = Array.isArray(pending?.data) ? pending.data : [];
      const driverList = Array.isArray(drivers?.data) ? drivers.data : [];
      setPendingApprovals(pendingList.length);
      setPendingDrivers(driverList.length);
    } catch (e) {
      logClientError("admin.approvals", e);
    }
  }, []);

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
    loadApprovals();
  }, [loadFast, loadFull, loadApprovals]);

  useEffect(() => {
    const a = setInterval(() => { loadFast(); loadApprovals(); }, 8000);
    const b = setInterval(() => setSince((s) => s + 1), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [loadFast, loadApprovals]);

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

  const refreshAll = () => {
    loadFast();
    loadFull();
    loadApprovals();
  };

  const approve = async (rid) => {
    if (!rid) return;
    try {
      const r = await api.post(`/admin/restaurants/${rid}/approve`);
      const d = r?.data || r;
      if (d?.blockers?.length) {
        alert(`Approved with blockers: ${d.blockers.join(", ")}\nStatus: ${d.launch_status_label || d.launch_status}`);
      }
      await Promise.all([loadFast(), loadFull(), loadApprovals()]);
    } catch (e) {
      logClientError("admin.approve", e);
      alert(e?.message || "Approval failed");
    }
  };

  const counts = attention?.counts ?? { pending: 0, stuck: 0, failed: 0 };

  const tabs = [
    { id: "pulse", label: "Pulse" },
    { id: "approvals", label: `Approvals${pendingApprovals ? ` · ${pendingApprovals}` : ""}` },
    { id: "drivers", label: `Drivers${pendingDrivers ? ` · ${pendingDrivers}` : ""}` },
    { id: "attention", label: `Attention${counts.pending + counts.stuck + counts.failed ? ` · ${counts.pending + counts.stuck + counts.failed}` : ""}` },
    { id: "users", label: "Users" },
    { id: "restaurants", label: "Restaurants" },
    { id: "orders", label: "Orders" },
  ];

  const retryAll = () => {
    setLoading(true);
    setLoadError(false);
    refreshAll();
  };

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <PulseHeader since={since} onRefresh={retryAll} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin/system-health" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-system-health-link">
            <Activity size={16} /> System Health
          </Link>
          <Link href="/admin/logistics" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-logistics-link">
            <MapPin size={16} /> Live Logistics Map
          </Link>
          <Link href="/admin/founder-driver" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-founder-driver-link">
            <Truck size={16} /> Founder Driver Mode
          </Link>
          <Link href="/admin/marketplace" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-marketplace-link">
            <Store size={16} /> Marketplace Manager
          </Link>
          <Link href="/admin/compliance" className="btn-primary inline-flex items-center gap-2 text-sm">
            Compliance Center
          </Link>
          <Link href="/admin/uber-direct" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-uber-direct-link">
            <Truck size={16} /> Uber Direct
          </Link>
          <Link href="/admin/stripe" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-stripe-link">
            <CreditCard size={16} /> Stripe
          </Link>
          <Link href="/admin/revenue" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-revenue-link">
            <DollarSign size={16} /> Revenue Center
          </Link>
          <Link href="/admin/financial-analytics" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-financial-analytics-link">
            <BarChart3 size={16} /> Financial Analytics
          </Link>
          <Link href="/admin/pricing" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-pricing-link">
            <Calculator size={16} /> Pricing Engine
          </Link>
<<<<<<< HEAD
          <Link href="/admin/commission" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-commission-link">
            <Percent size={16} /> Commission Engine
          </Link>
          <Link href="/admin/pricing-rules" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-pricing-rules-link">
            <SlidersHorizontal size={16} /> Pricing Rules
=======
          <Link href="/admin/pricing-optimizer" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-pricing-optimizer-link">
            <Brain size={16} /> AI Pricing Optimizer
>>>>>>> origin/cursor/ai-pricing-optimizer-b576
          </Link>
          <Link href="/admin/spotlight" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-spotlight-link">
            <Sparkles size={16} /> Local Partner Spotlight
          </Link>
          <Link href="/admin/dreamland" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="admin-dreamland-link">
            <Sparkles size={16} /> Dreamland AI
          </Link>
          <Link href="/admin/profiles" className="btn-secondary inline-flex items-center gap-2 text-sm" data-testid="admin-profiles-link">
            <Shield size={16} /> Profile moderation
          </Link>
          <GeocodeRestaurantsButton />
          <Link
            href="/admin/import-restaurants"
            className="btn-ghost inline-flex items-center gap-2 text-sm"
            data-testid="admin-import-link"
          >
            <Download size={16} /> Restaurant Bulk Import
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
              {t.id === "approvals" && pendingApprovals > 0 && (
                <span
                  className="text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center"
                  style={{ background: "var(--primary)", color: "#0A0A0A" }}
                >
                  {pendingApprovals}
                </span>
              )}
              {t.id === "drivers" && pendingDrivers > 0 && (
                <span
                  className="text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center"
                  style={{ background: "var(--primary)", color: "#0A0A0A" }}
                  data-testid="drivers-pending-badge"
                >
                  {pendingDrivers}
                </span>
              )}
              {t.id === "attention" && (counts.pending + counts.stuck + counts.failed) > 0 && (
                <span
                  className="text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center"
                  style={{ background: "var(--primary)", color: "#0A0A0A" }}
                  data-testid="attention-badge"
                >
                  {counts.pending + counts.stuck + counts.failed}
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
                  <AttentionSummary counts={{ ...counts, pending: counts.pending + pendingApprovals }} onResolve={() => setTab("approvals")} />
                  <ActivityFeed events={activity} />
                </div>
              )}
              {tab === "approvals" && (
                <ApprovalsTab onChanged={refreshAll} onReview={setDossierUserId} />
              )}
              {tab === "drivers" && (
                <PartnerApprovalsPanel
                  partnerType="drivers"
                  onChanged={refreshAll}
                  onReview={setDossierUserId}
                />
              )}
              {tab === "attention" && <AttentionTab attention={attention} onApprove={approve} />}
              {tab === "users" && <UsersTable users={users} />}
              {tab === "restaurants" && (
                <div className="space-y-8">
                  <div>
                    <h2 className="font-display text-xl font-bold mb-4">Restaurant partners</h2>
                    <PartnerApprovalsPanel
                      partnerType="restaurants"
                      onChanged={refreshAll}
                      onReview={setDossierUserId}
                    />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold mb-4">Restaurant listings</h2>
                    <RestaurantsList
                      restaurants={restaurants}
                      onApprove={approve}
                      onEditLocation={setLocationRestaurantId}
                    />
                  </div>
                </div>
              )}
              {tab === "orders" && <OrdersTable orders={orders} />}
            </>
          )}
        </div>
        {dossierUserId && (
          <ComplianceDossier userId={dossierUserId} onClose={() => setDossierUserId(null)} onAction={refreshAll} />
        )}
        {locationRestaurantId && (
          <RestaurantLocationEditor
            restaurantId={locationRestaurantId}
            onClose={() => setLocationRestaurantId(null)}
            onSaved={refreshAll}
          />
        )}
      </div>
    </div>
  );
}
