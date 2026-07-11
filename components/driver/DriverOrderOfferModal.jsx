"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api, getApiErrorMessage } from "@/lib/api";
import { getDriverDeviceId } from "@/lib/driverDeviceId";
import { playNewOrderOfferSound, playOfferTimeoutSound, primeDriverOfferSound } from "@/lib/driverOfferSound";
import { useWebPush } from "@/lib/useWebPush";
import { MapPin, DollarSign, Clock, Truck } from "lucide-react";

export default function DriverOrderOfferModal({ offer, onClear, onRefresh }) {
  const [secondsLeft, setSecondsLeft] = useState(offer?.ttl_seconds ?? 20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const { fire } = useWebPush("ZoomEats Driver");
  const deviceId = getDriverDeviceId();

  useEffect(() => {
    primeDriverOfferSound();
    playNewOrderOfferSound();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([300, 120, 300, 120, 400]);
    }
    fire(
      "New Delivery Available!",
      `Pickup: ${offer?.restaurant_name || offer?.meta?.restaurant_name || "Restaurant"}`,
      { tag: `offer-${offer?.offer_id}`, requireInteraction: true }
    );
  }, [offer?.offer_id, fire, offer?.restaurant_name, offer?.meta?.restaurant_name]);

  useEffect(() => {
    if (!offer?.expires_at) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        handleExpire();
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.offer_id, offer?.expires_at]);

  const handleExpire = useCallback(async () => {
    if (!offer?.offer_id || busy) return;
    setBusy(true);
    try {
      await api.post(`/driver/offers/${offer.offer_id}/expire`, { device_id: deviceId });
      playOfferTimeoutSound();
      onClear?.();
      await onRefresh?.();
    } catch (e) {
      onClear?.();
    } finally {
      setBusy(false);
    }
  }, [offer?.offer_id, busy, deviceId, onClear, onRefresh]);

  const respond = async (action) => {
    if (!offer?.offer_id || busy) return;
    setErr("");
    setBusy(true);
    try {
      const res = await api.post(`/driver/offers/${offer.offer_id}/${action}`, { device_id: deviceId });
      const data = res?.data || res;
      if (action === "accept" && data?.navigate_to) {
        onClear?.();
        await onRefresh?.();
        router.push(data.navigate_to);
        return;
      }
      onClear?.();
      await onRefresh?.();
    } catch (e) {
      setErr(getApiErrorMessage(e, "Could not respond to offer"));
    } finally {
      setBusy(false);
    }
  };

  if (!offer) return null;

  const pct = Math.max(0, Math.min(100, (secondsLeft / 20) * 100));
  const restaurant = offer.restaurant_name || offer.meta?.restaurant_name || "Restaurant";
  const area = offer.customer_area || offer.meta?.customer_area || "Customer area";
  const earnings = offer.estimated_earnings ?? offer.meta?.estimated_earnings;
  const distance = offer.estimated_distance_km ?? offer.meta?.estimated_distance_km;
  const eta = offer.estimated_eta_min ?? offer.meta?.estimated_eta_min;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.72)" }}
        data-testid="driver-order-offer-modal"
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 16 }}
          className="w-full max-w-md card p-6 shadow-2xl border-2"
          style={{ borderColor: "var(--primary)" }}
        >
          <div className="text-center">
            <div className="label-eyebrow">New Delivery Available!</div>
            <h2 className="font-display text-3xl font-black mt-1">Accept within</h2>
            <div className="relative w-32 h-32 mx-auto mt-4" data-testid="offer-countdown">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - pct / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-display text-4xl font-black">
                {secondsLeft}
              </div>
            </div>
            <div className="w-full h-2 rounded-full mt-4 overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: "var(--primary)" }} />
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Truck size={18} style={{ color: "var(--primary)" }} />
              <div><span className="font-bold">Pickup:</span> {restaurant}</div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin size={18} style={{ color: "var(--primary)" }} />
              <div><span className="font-bold">Drop-off:</span> {area}</div>
            </div>
            {distance != null && (
              <div className="flex items-center gap-3">
                <MapPin size={18} style={{ color: "var(--muted)" }} />
                <span>{Number(distance).toFixed(1)} km estimated</span>
              </div>
            )}
            {earnings != null && (
              <div className="flex items-center gap-3">
                <DollarSign size={18} style={{ color: "var(--muted)" }} />
                <span>Est. earnings ${Number(earnings).toFixed(2)}</span>
              </div>
            )}
            {eta != null && (
              <div className="flex items-center gap-3">
                <Clock size={18} style={{ color: "var(--muted)" }} />
                <span>Est. {eta} min delivery</span>
              </div>
            )}
          </div>

          {err && <p className="text-sm mt-4" style={{ color: "var(--primary)" }}>{err}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={busy || secondsLeft <= 0}
              onClick={() => respond("decline")}
              data-testid="offer-decline-btn"
            >
              Decline
            </button>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy || secondsLeft <= 0}
              onClick={() => respond("accept")}
              data-testid="offer-accept-btn"
            >
              Accept Order
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
