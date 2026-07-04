"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api, getWalletBalance, requestWalletPayout } from "@/lib/api";
import Header from "@/components/Header";
import { MapPin, Power, Truck } from "lucide-react";
import { formatMoney, sanitizeActiveDispatch, sanitizeOrders, sanitizeWallet } from "@/lib/safeData";
import { logClientError } from "@/lib/clientErrorLog";
import { ErrorState } from "@/components/ui/PageStates";

const HEARTBEAT_MS = 8000;

function useGeolocation(active) {
  const [coords, setCoords] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setErr(null); },
      (e) => setErr(e.message || "Location unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { coords, err };
}

export default function DeliveryDashboard() {
  const [online, setOnline] = useState(false);
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [activeDispatch, setActiveDispatch] = useState({ driver: null, orders: [] });
  const [wallet, setWallet] = useState({ available: 0.0, pending: 0.0 });
  const [payoutAmt, setPayoutAmt] = useState(0.0);
  const [loadError, setLoadError] = useState(false);
  const { coords, err: geoErr } = useGeolocation(online);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOnline(localStorage.getItem("zoomeats_driver_online") === "1");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [a, m, act] = await Promise.all([
        api.get("/delivery/available"),
        api.get("/delivery/my"),
        api.get("/driver/active"),
      ]);
      setAvailable(sanitizeOrders(a?.data));
      setMine(sanitizeOrders(m?.data));
      setActiveDispatch(sanitizeActiveDispatch(act?.data));
      setLoadError(false);
      try {
        const wb = await getWalletBalance();
        setWallet(sanitizeWallet(wb?.data));
      } catch (e) {
        logClientError("delivery.wallet", e);
      }
    } catch (e) {
      logClientError("delivery.refresh", e);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  // Toggle online → flip availability + persist
  const toggleOnline = async () => {
    const next = !online;
    setOnline(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("zoomeats_driver_online", next ? "1" : "0");
    }
    try {
      await api.post("/driver/availability", { available: next });
    } catch (e) {
      logClientError("delivery.toggleOnline", e);
    }
  };

  // GPS heartbeat — every HEARTBEAT_MS while online + coords
  useEffect(() => {
    if (!online || !coords) return;
    const send = async () => {
      const now = Date.now();
      if (now - lastSentRef.current < HEARTBEAT_MS - 500) return;
      lastSentRef.current = now;
      try {
        await api.post("/driver/location", { latitude: coords.lat, longitude: coords.lng });
      } catch (e) {
        console.warn("[delivery] heartbeat failed:", e);
      }
    };
    send();
    const t = setInterval(send, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [online, coords]);

  const action = async (oid, act) => {
    if (!oid) return;
    try {
      await api.post(`/delivery/orders/${oid}/${act}`);
      await refresh();
    } catch (e) {
      logClientError("delivery.action", e, { oid, act });
    }
  };

  const dispatchOrders = activeDispatch?.orders ?? [];

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
        {/* Online toggle banner */}
        <div className="card p-5 flex items-center gap-4" data-testid="online-toggle-card">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: online ? "var(--primary)" : "var(--surface-2)", color: online ? "#0A0A0A" : "var(--muted)" }}
          >
            <Power size={22} />
          </div>
          <div className="flex-1">
            <div className="font-display text-xl font-bold">
              {online ? "You're online" : "You're offline"}
            </div>
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              {online
                ? coords
                  ? <>📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} · heartbeat every {HEARTBEAT_MS/1000}s</>
                  : "Waiting for GPS…"
                : "Tap the button to start receiving dispatches"}
              {geoErr && <span style={{ color: "var(--primary)" }}> · {geoErr}</span>}
            </div>
          </div>
          <button
            className={online ? "btn-secondary" : "btn-primary"}
            onClick={toggleOnline}
            data-testid="online-toggle-button"
          >
            {online ? "Go offline" : "Go online"}
          </button>
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorState title="Could not refresh deliveries" onRetry={refresh} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="card p-5">
            <div className="label-eyebrow">Active deliveries</div>
            <div className="font-display text-3xl font-black mt-1">{mine.filter((o) => o.status !== "delivered").length}</div>
          </div>
          <div className="card p-5">
            <div className="label-eyebrow">Wallet</div>
            <div className="font-display text-3xl font-black mt-1">${formatMoney(wallet.available)}</div>
            <div className="text-sm" style={{ color: "var(--muted)" }}>Pending: ${formatMoney(wallet.pending)}</div>
            <div className="mt-3 flex gap-2">
              <input className="input-field" type="number" step="0.01" value={payoutAmt} onChange={(e) => setPayoutAmt(e.target.value)} style={{ width: 120 }} />
              <button className="btn-primary" onClick={async () => {
                try {
                  const r = await requestWalletPayout(parseFloat(payoutAmt));
                  alert(`Payout requested: ${r?.data?.payout_id ?? "unknown"}`);
                  const wb = await getWalletBalance();
                  setWallet(sanitizeWallet(wb?.data));
                } catch (e) {
                  alert('Payout failed');
                }
              }}>Payout</button>
            </div>
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

        {/* Auto-dispatched (internal) orders */}
        {dispatchOrders.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Truck size={20} style={{ color: "var(--primary)" }} /> Dispatched to you
            </h2>
            <div className="space-y-3">
              {dispatchOrders.map((o) => (
                <div key={o.order_id} className="card p-5 flex items-center justify-between" style={{ borderColor: "var(--primary)" }} data-testid={`dispatched-${o.order_id}`}>
                  <div>
                    <div className="font-bold">{o.restaurant_name ?? "Unknown Restaurant"}</div>
                    <div className="text-sm flex items-center gap-1" style={{ color: "var(--muted)" }}>
                      <MapPin size={12} /> {o.address || "—"}
                    </div>
                    <span className="badge mt-2">{o.status ?? "unknown"}</span>
                  </div>
                  {o.status === "assigned_internal" && (
                    <button className="btn-primary !py-2" onClick={() => action(o.order_id, "accept")} data-testid={`pickup-${o.order_id}`}>
                      Pickup
                    </button>
                  )}
                  {o.status === "picked_up" && (
                    <button className="btn-primary !py-2" onClick={() => action(o.order_id, "deliver")} data-testid={`deliver-${o.order_id}`}>
                      Mark delivered
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10">
          <h2 className="font-display text-2xl font-bold mb-4">Available pickups</h2>
          {available.length === 0 ? (
            <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>
              No orders ready for pickup right now.
            </div>
          ) : (
            <div className="space-y-3">
              {available.map((o) => (
                <div key={o.order_id} className="card p-5 flex items-center justify-between" data-testid={`avail-${o.order_id}`}>
                  <div>
                    <div className="font-bold">{o.restaurant_name ?? "Unknown Restaurant"}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>To: {o.address || "—"} · ${formatMoney(o.total)}</div>
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
                    <div className="font-bold">{o.restaurant_name ?? "Unknown Restaurant"}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>{o.address || "—"}</div>
                    <div className="badge mt-2">{o.status ?? "unknown"}</div>
                  </div>
                  {o.status === "picked_up" && (
                    <button className="btn-primary !py-2" onClick={() => action(o.order_id, "deliver")} data-testid={`deliver-mine-${o.order_id}`}>
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
