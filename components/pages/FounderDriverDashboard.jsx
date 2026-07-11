"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, getApiErrorMessage } from "@/lib/api";
import Header from "@/components/Header";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { setFounderDriverModeActive, setShadowDispatchActive } from "@/lib/founderDriver/session";
import { sanitizeOrders } from "@/lib/safeData";
import { Truck, MapPin, BarChart3, MessageSquare, Star, Camera, ClipboardList, Power } from "lucide-react";
import PickupPhotoInstructions from "@/components/driver/PickupPhotoInstructions";
import DriverOrderOfferModal from "@/components/driver/DriverOrderOfferModal";
import DriverDeliveryWorkflow from "@/components/driver/DriverDeliveryWorkflow";
import { getDriverDeviceId } from "@/lib/driverDeviceId";
import { useDriverOfferRealtime } from "@/lib/hooks/useDriverOfferRealtime";
import { useDriverGpsTracking } from "@/lib/hooks/useDriverGpsTracking";
import { primeDriverOfferSound } from "@/lib/driverOfferSound";
import { useWebPush } from "@/lib/useWebPush";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "driver", label: "Driver Testing" },
  { id: "restaurant", label: "Restaurant Intel" },
  { id: "journal", label: "Experience Journal" },
  { id: "dispatch", label: "Dispatch" },
  { id: "heatmap", label: "Heatmap" },
  { id: "feedback", label: "Feedback" },
];

function StarRow({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="text-lg"
            onClick={() => onChange(n)}
            aria-label={`${label} ${n}`}
          >
            {n <= (value || 0) ? "★" : "☆"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FounderDriverDashboard() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "overview");
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [scorecards, setScorecards] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [dispatchInsight, setDispatchInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pickupGallery, setPickupGallery] = useState([]);
  const [msg, setMsg] = useState("");
  const [claimableOrders, setClaimableOrders] = useState([]);
  const [claimingId, setClaimingId] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [manualOrderId, setManualOrderId] = useState("");
  const [online, setOnline] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const deviceId = typeof window !== "undefined" ? getDriverDeviceId() : "";
  const driverId = status?.driver?.driver_id;
  const { request: requestPush } = useWebPush("ZoomEats Driver");

  const { coords } = useDriverGpsTracking({
    enabled: online || Boolean(status?.current_delivery),
    activeOrderId: status?.current_delivery?.order_id,
    activeOrderStatus: status?.current_delivery?.status,
  });

  const [pickupForm, setPickupForm] = useState({
    order_id: "",
    wait_minutes: "",
    employee_interaction_rating: 4,
    pickup_difficulty: "easy",
    parking_difficulty: "medium",
    order_accuracy: "accurate",
    special_notes: "",
  });
  const [journalForm, setJournalForm] = useState({
    order_id: "",
    dispatch_rating: 4,
    navigation_rating: 4,
    restaurant_rating: 4,
    customer_rating: 4,
    parking: "easy",
    safety: "safe",
    platform_revenue: "4.10",
    driver_pay: "9.25",
    tip: "6.00",
    miles: "5.2",
    delivery_minutes: "24",
    notes: "",
  });
  const [noteForm, setNoteForm] = useState({ order_id: "", note: "" });
  const [feedbackForm, setFeedbackForm] = useState({
    category: "dispatch",
    problem: "",
    suggested_fix: "",
    priority: "high",
  });

  const loadPickupGallery = useCallback(async (restaurantId) => {
    try {
      const res = await api.get("/founder-driver/pickup-photos", {
        params: restaurantId ? { restaurant_id: restaurantId } : {},
      });
      setPickupGallery(Array.isArray(res?.data?.photos) ? res.data.photos : res?.photos || []);
    } catch {
      setPickupGallery([]);
    }
  }, []);

  const loadClaimableOrders = useCallback(async () => {
    try {
      const res = await api.get("/founder-driver/claimable-orders");
      const orders = res?.data?.orders ?? res?.orders ?? [];
      setClaimableOrders(Array.isArray(orders) ? orders : []);
    } catch {
      setClaimableOrders([]);
    }
  }, []);

  const claimOrder = async (orderId) => {
    if (!orderId) return;
    setClaimingId(orderId);
    try {
      const res = await api.post("/founder-driver/claim-order", { order_id: orderId });
      const navigateTo = res?.data?.navigate_to || res?.navigate_to || `/driver/navigate/${orderId}`;
      setMsg(`Assigned to order ${orderId}. Opening driver navigation…`);
      setManualOrderId("");
      await load();
      await loadClaimableOrders();
      await refreshActiveOrders();
      window.location.href = navigateTo;
    } catch (e) {
      setMsg(getApiErrorMessage(e, "Could not claim order."));
    } finally {
      setClaimingId("");
    }
  };

  const requestOffer = async (orderId) => {
    if (!orderId) return;
    setOfferingId(orderId);
    try {
      if (!status?.session_active) {
        await api.post("/founder-driver/session", { action: "start" });
        setFounderDriverModeActive(true);
      }
      if (!online) {
        setOnline(true);
        if (typeof window !== "undefined") localStorage.setItem("zoomeats_driver_online", "1");
        await api.post("/driver/availability", { available: true });
      }
      await api.post("/founder-driver/request-offer", { order_id: orderId });
      setMsg(`Offer sent for ${orderId} — accept or decline in the popup.`);
      setManualOrderId("");
      const stRes = await api.get("/founder-driver/status");
      const freshDriverId = stRes?.data?.driver?.driver_id ?? stRes?.driver?.driver_id;
      if (freshDriverId) {
        const res = await api.get("/driver/offers/active", { params: { device_id: deviceId } });
        const offer = res?.data?.offer ?? res?.offer;
        if (offer && !res?.data?.locked_elsewhere && !res?.locked_elsewhere) {
          primeDriverOfferSound();
          setIncomingOffer({
            ...offer,
            ttl_seconds: offer.ttl_seconds ?? Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - Date.now()) / 1000)),
          });
        }
      }
      await load();
      await loadClaimableOrders();
    } catch (e) {
      setMsg(getApiErrorMessage(e, "Could not send offer."));
    } finally {
      setOfferingId("");
    }
  };

  const loadActiveOffer = useCallback(async () => {
    if (!online || !driverId) return;
    try {
      const res = await api.get("/driver/offers/active", { params: { device_id: deviceId } });
      const offer = res?.data?.offer ?? res?.offer;
      if (offer && !res?.data?.locked_elsewhere && !res?.locked_elsewhere) {
        setIncomingOffer({
          ...offer,
          ttl_seconds: offer.ttl_seconds ?? Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - Date.now()) / 1000)),
        });
      }
    } catch (e) {
      console.warn(e);
    }
  }, [online, driverId, deviceId]);

  const toggleOnline = async () => {
    const next = !online;
    setOnline(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("zoomeats_driver_online", next ? "1" : "0");
    }
    try {
      if (!status?.session_active && next) {
        await api.post("/founder-driver/session", { action: "start" });
        setFounderDriverModeActive(true);
      }
      await api.post("/driver/availability", { available: next });
      if (next) {
        primeDriverOfferSound();
        requestPush();
        await load();
        await loadActiveOffer();
      } else {
        setIncomingOffer(null);
      }
      setMsg(next ? "You are online — offers will appear here with accept/decline." : "You are offline.");
    } catch (e) {
      setMsg(getApiErrorMessage(e, "Could not update availability."));
    }
  };

  const refreshActiveOrders = useCallback(async () => {
    try {
      const res = await api.get("/driver/active");
      const orders = res?.data?.orders ?? res?.orders ?? [];
      setActiveOrders(sanitizeOrders(orders));
    } catch {
      setActiveOrders([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, met, hm, sc, fb] = await Promise.all([
        api.get("/founder-driver/status"),
        api.get("/founder-driver/metrics"),
        api.get("/founder-driver/heatmap"),
        api.get("/founder-driver/scorecards"),
        api.get("/founder-driver/feedback"),
      ]);
      setStatus(st?.data || null);
      setOnline(Boolean(st?.data?.driver?.online));
      if (typeof window !== "undefined" && st?.data?.driver?.online) {
        localStorage.setItem("zoomeats_driver_online", "1");
      }
      setMetrics(met?.data || null);
      setHeatmap(hm?.data || null);
      setScorecards(Array.isArray(sc?.data) ? sc.data : []);
      setFeedbackList(Array.isArray(fb?.data) ? fb.data : []);
      setError(false);
      if (st?.data?.current_delivery?.order_id) {
        setPickupForm((f) => ({ ...f, order_id: st.data.current_delivery.order_id }));
        setJournalForm((f) => ({ ...f, order_id: st.data.current_delivery.order_id }));
      }
      await loadPickupGallery();
      await loadClaimableOrders();
      await refreshActiveOrders();
    } catch (e) {
      console.warn(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loadPickupGallery, loadClaimableOrders, refreshActiveOrders]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [searchParams]);

  useEffect(() => {
    if (online) loadActiveOffer();
  }, [online, loadActiveOffer]);

  useEffect(() => {
    if (!online) return;
    const t = setInterval(loadActiveOffer, 5000);
    return () => clearInterval(t);
  }, [online, loadActiveOffer]);

  useDriverOfferRealtime(driverId, (payload) => {
    if (payload?.event === "offer_accepted") {
      setIncomingOffer(null);
      load();
      return;
    }
    if (payload?.offer_id) {
      setIncomingOffer(payload);
    }
  });

  const startSession = async (shadow = false) => {
    await api.post("/founder-driver/session", { action: "start", shadow_dispatch: shadow });
    setFounderDriverModeActive(true);
    setShadowDispatchActive(shadow);
    setMsg(shadow ? "Shadow dispatch enabled — founder driver session started." : "Founder driver session started.");
    await load();
  };

  const stopSession = async () => {
    await api.post("/founder-driver/session", { action: "stop" });
    setFounderDriverModeActive(false);
    setShadowDispatchActive(false);
    setMsg("Session ended.");
    await load();
  };

  const loadDispatch = async () => {
    const oid = journalForm.order_id || status?.current_delivery?.order_id;
    if (!oid) return;
    const res = await api.get("/founder-driver/dispatch-insight", { params: { order_id: oid } });
    setDispatchInsight(res?.data || null);
  };

  const submitPickup = async () => {
    await api.post("/founder-driver/pickup-log", pickupForm);
    setMsg("Pickup intelligence logged.");
    await load();
  };

  const submitJournal = async () => {
    await api.post("/founder-driver/journal", journalForm);
    setMsg("Delivery journal saved.");
    await load();
  };

  const submitNote = async () => {
    await api.post("/founder-driver/notes", noteForm);
    setNoteForm({ order_id: "", note: "" });
    setMsg("Founder note saved (admin-only).");
  };

  const submitFeedback = async () => {
    await api.post("/founder-driver/feedback", {
      ...feedbackForm,
      order_id: journalForm.order_id || status?.current_delivery?.order_id,
    });
    setFeedbackForm({ category: "dispatch", problem: "", suggested_fix: "", priority: "high" });
    setMsg("Feature feedback sent to internal roadmap.");
    await load();
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="max-w-6xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading Founder Driver Mode…" rows={4} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <ErrorState title="Founder Driver unavailable" description="You may not have founder_driver permission." onRetry={load} />
        </div>
      </div>
    );
  }

  const weekly = metrics?.weekly_insights;

  return (
    <div>
      <Header />
      {incomingOffer && (
        <DriverOrderOfferModal
          offer={incomingOffer}
          onClear={() => setIncomingOffer(null)}
          onRefresh={async () => {
            await load();
            await refreshActiveOrders();
          }}
        />
      )}
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="label-eyebrow">Internal · Admin only</div>
            <h1 className="font-display text-4xl font-black tracking-tight">Founder Driver Mode</h1>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--muted)" }}>
              Operate as a real driver with operational analytics layered on top. Does not bypass payments, GPS, or dispatch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!status?.session_active ? (
              <>
                <button type="button" className="btn-primary" onClick={() => startSession(false)} data-testid="founder-session-start">
                  Enable Founder Mode
                </button>
                <button type="button" className="btn-secondary" onClick={() => startSession(true)} data-testid="founder-shadow-start">
                  Shadow Dispatch
                </button>
              </>
            ) : (
              <button type="button" className="btn-secondary" onClick={stopSession} data-testid="founder-session-stop">
                End Session
              </button>
            )}
            <Link href="/driver/dashboard" className="btn-secondary flex items-center gap-2" data-testid="founder-go-drive">
              <Truck size={16} /> Go Drive
            </Link>
          </div>
        </div>

        {msg && (
          <div className="card p-3 mb-6 text-sm" style={{ borderColor: "var(--accent)" }}>{msg}</div>
        )}

        <div className="flex flex-wrap gap-2 mb-8">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`badge ${tab === t.id ? "ring-2 ring-[var(--primary)]" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="label-eyebrow">Status</div>
                <div className="font-bold mt-1">{status?.driver?.online ? "Online" : "Offline"}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{status?.driver?.busy ? "Busy" : "Available"}</div>
              </div>
              <div className="card p-4">
                <div className="label-eyebrow">Founder deliveries</div>
                <div className="font-display text-2xl font-black">{metrics?.total_deliveries ?? 0}</div>
              </div>
              <div className="card p-4">
                <div className="label-eyebrow">Avg wait</div>
                <div className="font-display text-2xl font-black">{metrics?.average_wait_min ?? "—"} min</div>
              </div>
              <div className="card p-4">
                <div className="label-eyebrow">Effective hourly</div>
                <div className="font-display text-2xl font-black">${metrics?.average_effective_hourly ?? "—"}/hr</div>
              </div>
            </div>

            {weekly && (
              <div className="card p-6">
                <h2 className="font-display text-xl font-bold flex items-center gap-2"><BarChart3 size={18} /> Founder Insights</h2>
                <p className="mt-3 text-sm"><strong>{weekly.title}</strong> — {weekly.completed_deliveries} deliveries logged</p>
                <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Most common issue: {weekly.most_common_issue}</p>
                <p className="mt-2 text-sm">Recommendation: {weekly.recommendation}</p>
                <p className="mt-2 text-sm">Drivers could earn ~{weekly.driver_earnings_opportunity} more · CSAT +{weekly.customer_satisfaction_delta}</p>
                <p className="mt-2 text-sm font-bold">Suggested feature: {weekly.suggested_feature}</p>
              </div>
            )}
          </div>
        )}

        {tab === "driver" && (
          <div className="card p-6 space-y-4">
            <h2 className="font-display text-xl font-bold">Driver Testing</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Role: {status?.founder_role || "founder"} · Session: {status?.session_active ? "active" : "inactive"}
              {status?.shadow_dispatch ? " · Shadow dispatch ON" : ""}
            </p>

            <div className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4" style={{ borderColor: "var(--border)" }} data-testid="founder-online-toggle">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: online ? "var(--primary)" : "var(--surface-2)", color: online ? "#0A0A0A" : "var(--muted)" }}
                >
                  <Power size={20} />
                </div>
                <div>
                  <div className="font-bold">{online ? "Online" : "Offline"}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {online ? "Listening for delivery offers with accept/decline" : "Go online to receive offers"}
                  </div>
                </div>
              </div>
              <button type="button" className={online ? "btn-secondary" : "btn-primary"} onClick={toggleOnline} data-testid="founder-toggle-online">
                {online ? "Go Offline" : "Go Online"}
              </button>
            </div>

            {status?.current_delivery ? (
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--border)" }}>
                <div className="font-bold">Current delivery</div>
                <div className="text-sm mt-2">Order {status.current_delivery.order_id}</div>
                <div className="text-sm">{status.current_delivery.restaurant} → {status.current_delivery.customer}</div>
                <div className="text-sm flex items-center gap-1 mt-1" style={{ color: "var(--muted)" }}>
                  <MapPin size={12} /> {status.current_delivery.address}
                </div>
                <span className="badge mt-2">{status.current_delivery.status}</span>
                <DriverDeliveryWorkflow
                  order={{
                    order_id: status.current_delivery.order_id,
                    status: status.current_delivery.status,
                  }}
                  coords={coords}
                  onRefresh={load}
                />
                <div className="mt-3">
                  <Link href={`/driver/navigate/${status.current_delivery.order_id}`} className="btn-primary text-sm inline-flex items-center gap-2">
                    <Truck size={14} /> Open navigation
                  </Link>
                </div>
              </div>
            ) : activeOrders.length > 0 ? (
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)" }} data-testid="founder-active-queue">
                <div className="font-bold">Your order queue</div>
                {activeOrders.map((o) => (
                  <div key={o.order_id} className="rounded-lg border p-3 text-sm space-y-2" style={{ borderColor: "var(--border)" }}>
                    <div className="font-bold">{o.restaurant_name || "Restaurant"}</div>
                    <div style={{ color: "var(--muted)" }}>{o.address || "—"}</div>
                    <div className="text-xs">{o.order_id} · {o.status}</div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/driver/navigate/${o.order_id}`} className="btn-primary text-sm inline-flex items-center gap-1">
                        <Truck size={14} /> Navigate
                      </Link>
                      <Link href="/driver/dashboard" className="btn-secondary text-sm">Open driver dashboard</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No active delivery. Go online for accept/decline offers, or claim an unassigned order below.
              </p>
            )}

            <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--border)" }} data-testid="founder-claim-orders">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold flex items-center gap-2"><ClipboardList size={16} /> Unassigned orders</h3>
                <button type="button" className="btn-secondary text-sm" onClick={loadClaimableOrders} data-testid="founder-claim-refresh">
                  Refresh list
                </button>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Send yourself an offer (accept/decline like the driver app) or claim directly to skip the timer.
              </p>

              <div className="flex flex-wrap gap-2">
                <input
                  className="input-field flex-1 min-w-[200px]"
                  placeholder="Order ID"
                  value={manualOrderId}
                  onChange={(e) => setManualOrderId(e.target.value)}
                  data-testid="founder-claim-manual-id"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!manualOrderId.trim() || !!offeringId || !!claimingId}
                  onClick={() => requestOffer(manualOrderId.trim())}
                  data-testid="founder-offer-manual-submit"
                >
                  {offeringId === manualOrderId.trim() ? "Sending…" : "Send offer"}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!manualOrderId.trim() || !!claimingId || !!offeringId}
                  onClick={() => claimOrder(manualOrderId.trim())}
                  data-testid="founder-claim-manual-submit"
                >
                  {claimingId === manualOrderId.trim() ? "Claiming…" : "Claim now"}
                </button>
              </div>

              {claimableOrders.length > 0 ? (
                <ul className="space-y-2">
                  {claimableOrders.map((o) => (
                    <li
                      key={o.order_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                      style={{ borderColor: "var(--border)" }}
                      data-testid={`founder-claim-row-${o.order_id}`}
                    >
                      <div>
                        <div className="font-bold">{o.restaurant_name || "Restaurant"}</div>
                        <div style={{ color: "var(--muted)" }}>{o.customer_name} · ${Number(o.total || 0).toFixed(2)}</div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          {o.order_id} · {o.status} · {o.payment_status}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          disabled={!!claimingId || !!offeringId}
                          onClick={() => requestOffer(o.order_id)}
                          data-testid={`founder-offer-btn-${o.order_id}`}
                        >
                          {offeringId === o.order_id ? "Sending…" : "Send offer"}
                        </button>
                        <button
                          type="button"
                          className="btn-primary text-sm"
                          disabled={!!claimingId || !!offeringId}
                          onClick={() => claimOrder(o.order_id)}
                          data-testid={`founder-claim-btn-${o.order_id}`}
                        >
                          {claimingId === o.order_id ? "Claiming…" : "Claim"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No unassigned orders right now.</p>
              )}
            </div>
          </div>
        )}

        {tab === "restaurant" && (
          <div className="space-y-4">
            <div className="card p-6 space-y-4">
              <h2 className="font-display text-xl font-bold flex items-center gap-2"><Camera size={18} /> Pickup Photo Instructions</h2>
              <input className="input-field" placeholder="Order ID" value={pickupForm.order_id} onChange={(e) => setPickupForm({ ...pickupForm, order_id: e.target.value })} />
              {pickupForm.order_id && (
                <PickupPhotoInstructions
                  orderId={pickupForm.order_id}
                  instructionsPath="/founder-driver/pickup-instructions"
                  allowGuideEdit
                />
              )}
            </div>
            <div className="card p-6 space-y-4">
              <h2 className="font-display text-xl font-bold">Restaurant Intelligence</h2>
            <input className="input-field" placeholder="Order ID" value={pickupForm.order_id} onChange={(e) => setPickupForm({ ...pickupForm, order_id: e.target.value })} />
            <input className="input-field" type="number" placeholder="Wait minutes" value={pickupForm.wait_minutes} onChange={(e) => setPickupForm({ ...pickupForm, wait_minutes: e.target.value })} />
            <StarRow label="Employee interaction" value={pickupForm.employee_interaction_rating} onChange={(v) => setPickupForm({ ...pickupForm, employee_interaction_rating: v })} />
            <select className="input-field" value={pickupForm.pickup_difficulty} onChange={(e) => setPickupForm({ ...pickupForm, pickup_difficulty: e.target.value })}>
              <option value="easy">Pickup: Easy</option>
              <option value="medium">Pickup: Medium</option>
              <option value="hard">Pickup: Hard</option>
            </select>
            <select className="input-field" value={pickupForm.parking_difficulty} onChange={(e) => setPickupForm({ ...pickupForm, parking_difficulty: e.target.value })}>
              <option value="easy">Parking: Easy</option>
              <option value="medium">Parking: Medium</option>
              <option value="hard">Parking: Hard</option>
            </select>
            <select className="input-field" value={pickupForm.order_accuracy} onChange={(e) => setPickupForm({ ...pickupForm, order_accuracy: e.target.value })}>
              <option value="accurate">Order accurate</option>
              <option value="minor_issue">Minor issue</option>
              <option value="wrong_items">Wrong items</option>
            </select>
            <textarea className="input-field" rows={3} placeholder="Special notes" value={pickupForm.special_notes} onChange={(e) => setPickupForm({ ...pickupForm, special_notes: e.target.value })} />
            <button type="button" className="btn-primary" onClick={submitPickup} data-testid="founder-pickup-log-submit">Log pickup intelligence</button>
            </div>
            <div className="card p-6">
              <h3 className="font-bold mb-3">Recent pickup photos (network)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {pickupGallery.slice(0, 12).map((p) => (
                  <a key={p.photo_id} href={p.url || "#"} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border aspect-square" style={{ borderColor: "var(--border)" }}>
                    {p.url ? <img src={p.url} alt={p.photo_type} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">{p.photo_type}</div>}
                  </a>
                ))}
                {!pickupGallery.length && <p className="text-sm col-span-full" style={{ color: "var(--muted)" }}>No pickup photos yet — capture them from driver testing.</p>}
              </div>
            </div>
          </div>
        )}

        {tab === "journal" && (
          <div className="card p-6 space-y-4">
            <h2 className="font-display text-xl font-bold">Driver Experience Journal</h2>
            <input className="input-field" placeholder="Order ID" value={journalForm.order_id} onChange={(e) => setJournalForm({ ...journalForm, order_id: e.target.value })} />
            <StarRow label="Dispatch" value={journalForm.dispatch_rating} onChange={(v) => setJournalForm({ ...journalForm, dispatch_rating: v })} />
            <StarRow label="Navigation" value={journalForm.navigation_rating} onChange={(v) => setJournalForm({ ...journalForm, navigation_rating: v })} />
            <StarRow label="Restaurant" value={journalForm.restaurant_rating} onChange={(v) => setJournalForm({ ...journalForm, restaurant_rating: v })} />
            <StarRow label="Customer" value={journalForm.customer_rating} onChange={(v) => setJournalForm({ ...journalForm, customer_rating: v })} />
            <div className="grid grid-cols-2 gap-3">
              <input className="input-field" placeholder="Platform revenue $" value={journalForm.platform_revenue} onChange={(e) => setJournalForm({ ...journalForm, platform_revenue: e.target.value })} />
              <input className="input-field" placeholder="Driver pay $" value={journalForm.driver_pay} onChange={(e) => setJournalForm({ ...journalForm, driver_pay: e.target.value })} />
              <input className="input-field" placeholder="Tip $" value={journalForm.tip} onChange={(e) => setJournalForm({ ...journalForm, tip: e.target.value })} />
              <input className="input-field" placeholder="Miles" value={journalForm.miles} onChange={(e) => setJournalForm({ ...journalForm, miles: e.target.value })} />
              <input className="input-field" placeholder="Minutes" value={journalForm.delivery_minutes} onChange={(e) => setJournalForm({ ...journalForm, delivery_minutes: e.target.value })} />
            </div>
            <textarea className="input-field" rows={3} placeholder="Notes" value={journalForm.notes} onChange={(e) => setJournalForm({ ...journalForm, notes: e.target.value })} />
            <button type="button" className="btn-primary" onClick={submitJournal} data-testid="founder-journal-submit">Save journal</button>
          </div>
        )}

        {tab === "dispatch" && (
          <div className="card p-6 space-y-4">
            <h2 className="font-display text-xl font-bold">Dispatch Intelligence</h2>
            <button type="button" className="btn-secondary" onClick={loadDispatch}>Load explainability for current order</button>
            {dispatchInsight && (
              <div className="rounded-xl border p-4 text-sm space-y-2" style={{ borderColor: "var(--border)" }}>
                <div>Dispatch score: <strong>{dispatchInsight.dispatch_score}</strong> · Confidence: {(Number(dispatchInsight.dispatch_confidence) * 100).toFixed(0)}%</div>
                <div>Restaurant distance: {dispatchInsight.score_breakdown?.restaurant_distance}%</div>
                <div>Customer distance: {dispatchInsight.score_breakdown?.customer_distance}%</div>
                <div>Wait prediction: {dispatchInsight.score_breakdown?.restaurant_wait_prediction}%</div>
                <div>Driver workload: {dispatchInsight.score_breakdown?.driver_workload}%</div>
                <div className="font-bold mt-2">{dispatchInsight.decision_reason}</div>
                <div>Est. payout ${dispatchInsight.estimated_payout} · Wait {dispatchInsight.estimated_wait_min} min · Profit ${dispatchInsight.profit_prediction}</div>
              </div>
            )}
          </div>
        )}

        {tab === "heatmap" && (
          <div className="space-y-4">
            <div className="card p-6">
              <h2 className="font-display text-xl font-bold">Logistics Heatmap</h2>
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>High-wait restaurants (≥12 min avg)</p>
              <ul className="mt-3 space-y-2 text-sm">
                {(heatmap?.high_wait_restaurants || []).map((r) => (
                  <li key={r.restaurant_id} className="flex justify-between">
                    <span>{r.restaurant_id}</span>
                    <span>{r.avg_wait_min} min avg · n={r.sample_count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-6">
              <h3 className="font-bold">Restaurant Scorecard</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {scorecards.slice(0, 10).map((r) => (
                  <li key={r.restaurant_id} className="flex justify-between gap-4">
                    <span>{r.restaurant_id}</span>
                    <span>wait {r.avg_wait_min ?? "—"} · accuracy {r.avg_order_accuracy ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "feedback" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6 space-y-3">
              <h2 className="font-display text-xl font-bold flex items-center gap-2"><MessageSquare size={18} /> Feature Feedback</h2>
              <input className="input-field" placeholder="Category" value={feedbackForm.category} onChange={(e) => setFeedbackForm({ ...feedbackForm, category: e.target.value })} />
              <textarea className="input-field" rows={2} placeholder="Problem" value={feedbackForm.problem} onChange={(e) => setFeedbackForm({ ...feedbackForm, problem: e.target.value })} />
              <textarea className="input-field" rows={2} placeholder="Suggested fix" value={feedbackForm.suggested_fix} onChange={(e) => setFeedbackForm({ ...feedbackForm, suggested_fix: e.target.value })} />
              <button type="button" className="btn-primary" onClick={submitFeedback}>Submit to roadmap</button>
            </div>
            <div className="card p-6 space-y-3">
              <h2 className="font-display text-xl font-bold flex items-center gap-2"><Star size={18} /> Founder Notes</h2>
              <input className="input-field" placeholder="Order ID (optional)" value={noteForm.order_id} onChange={(e) => setNoteForm({ ...noteForm, order_id: e.target.value })} />
              <textarea className="input-field" rows={4} placeholder="Private admin notes" value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} />
              <button type="button" className="btn-secondary" onClick={submitNote}>Save note</button>
              <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="text-xs font-bold mb-2">Open feedback</div>
                {feedbackList.slice(0, 5).map((f) => (
                  <div key={f.feedback_id} className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                    [{f.priority}] {f.category}: {f.problem}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
