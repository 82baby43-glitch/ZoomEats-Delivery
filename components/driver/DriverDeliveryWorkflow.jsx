"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getApiErrorMessage } from "@/lib/api";
import { formatDisplayOrderNumber, customerFirstName } from "@/lib/delivery/displayOrder";
import { Camera, CheckSquare, KeyRound, MapPin, Navigation, Package, Square } from "lucide-react";

const ACTIVE = ["assigned_internal", "arrived_at_store", "picked_up", "out_for_delivery", "arrived_at_customer"];

export default function DriverDeliveryWorkflow({ order, coords, onRefresh }) {
  const [prefs, setPrefs] = useState(null);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [pickupStoragePath, setPickupStoragePath] = useState("");
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [showPickupProblem, setShowPickupProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [verified, setVerified] = useState(false);
  const [readyBanner, setReadyBanner] = useState(false);

  const oid = order?.order_id;
  const status = order?.status;

  useEffect(() => {
    if (!oid || !ACTIVE.includes(status)) return;
    (async () => {
      try {
        const res = await api.get(`/driver/orders/${oid}/delivery-prefs`);
        setPrefs(res?.data || res);
        setVerified(Boolean(order?.verification_success));
      } catch {
        setPrefs(null);
      }
    })();
  }, [oid, status, order?.verification_success]);

  useEffect(() => {
    if (!order?.restaurant_ready_at) return;
    if (["arrived_at_store", "assigned_internal"].includes(status)) {
      setReadyBanner(true);
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    }
  }, [order?.restaurant_ready_at, status]);

  if (!order || !ACTIVE.includes(status)) return null;

  const pos = () => {
    if (!coords) throw new Error("Waiting for GPS…");
    return { latitude: coords.lat, longitude: coords.lng };
  };

  const run = async (fn) => {
    setErr("");
    setBusy(true);
    try {
      await fn();
      await onRefresh?.();
    } catch (e) {
      setErr(getApiErrorMessage(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const methodLabel = prefs?.delivery_method === "leave_at_door" ? "Leave at Door" : "Hand it to Me";
  const displayOrderNumber = prefs?.display_order_number || formatDisplayOrderNumber(oid);
  const customerName = prefs?.customer_first_name || customerFirstName(order?.customer_name);
  const verbalScript = prefs?.pickup_verbal_script || `Pickup for ${customerName}, order ${displayOrderNumber}`;
  const itemCount = prefs?.item_count ?? (Array.isArray(order?.items) ? order.items.length : null);
  const restaurantLabel = prefs?.restaurant_name || order?.restaurant_name || "Restaurant";
  const canCompletePickup =
    orderConfirmed && Boolean(pickupStoragePath) && ["arrived_at_store", "ready"].includes(status);

  const uploadPickupPhoto = async (file) => {
    setErr("");
    try {
      const presign = await api.post(`/driver/orders/${oid}/pickup-photo/presign`, {});
      const path = presign?.data?.storage_path || presign?.storage_path;
      const uploadUrl = presign?.data?.upload_url || presign?.upload_url;
      if (!uploadUrl || !path) throw new Error("Could not prepare photo upload");
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
      setPickupStoragePath(path);
    } catch (ex) {
      setErr(getApiErrorMessage(ex, "Pickup photo upload failed"));
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--primary)", background: "var(--surface-2)" }} data-testid={`delivery-workflow-${oid}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label-eyebrow">Delivery workflow</div>
          <div className="font-bold">{methodLabel}</div>
          {prefs?.delivery_instructions && (
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{prefs.delivery_instructions}</p>
          )}
          {prefs?.pin_required && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <KeyRound size={12} /> PIN required at handoff
            </p>
          )}
        </div>
        <Link href={`/driver/navigate/${oid}`} className="btn-secondary !py-2 text-sm inline-flex items-center gap-1 shrink-0">
          <Navigation size={14} /> Navigate
        </Link>
      </div>

      {readyBanner && (
        <div className="text-sm font-bold px-3 py-2 rounded-lg" style={{ background: "var(--primary)", color: "#0A0A0A" }} data-testid="pickup-ready-banner">
          Your pickup is ready.
        </div>
      )}

      {err && <p className="text-sm" style={{ color: "var(--primary)" }}>{err}</p>}

      {status === "assigned_internal" && (
        <button
          className="btn-primary w-full"
          disabled={busy || !coords}
          onClick={() => run(() => api.post(`/driver/orders/${oid}/arrive-store`, pos()))}
          data-testid="arrive-store-btn"
        >
          <MapPin size={16} className="inline mr-2" />
          Arrived at Store
        </button>
      )}

      {["arrived_at_store", "ready", "assigned_internal"].includes(status) && order.restaurant_ready_at && status !== "picked_up" && (
        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--border)" }} data-testid="pickup-verification-card">
          <div>
            <div className="label-eyebrow">Pick up at counter</div>
            <div className="text-2xl font-bold tracking-wide mt-1" data-testid="pickup-order-number">
              #{displayOrderNumber}
            </div>
            <p className="text-sm mt-1">
              For <span className="font-semibold">{customerName}</span>
              {itemCount != null ? ` · ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}
              {restaurantLabel ? ` · ${restaurantLabel}` : ""}
            </p>
          </div>

          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface)", color: "var(--muted)" }}>
            Tell staff: <span className="font-medium" style={{ color: "var(--text)" }}>&ldquo;{verbalScript}&rdquo;</span>
          </div>

          <button
            type="button"
            className="w-full flex items-start gap-3 text-left rounded-lg border px-3 py-3"
            style={{ borderColor: orderConfirmed ? "var(--primary)" : "var(--border)" }}
            onClick={() => setOrderConfirmed((v) => !v)}
            data-testid="pickup-order-confirmed"
          >
            {orderConfirmed ? <CheckSquare size={20} className="shrink-0 mt-0.5" /> : <Square size={20} className="shrink-0 mt-0.5" />}
            <span className="text-sm font-medium">I received the correct order</span>
          </button>

          <div className="space-y-2">
            <label className="label-eyebrow flex items-center gap-1">
              <Camera size={12} /> Photo of sealed bag
              <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>(required)</span>
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="text-sm w-full"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadPickupPhoto(file);
              }}
              data-testid="pickup-bag-photo-input"
            />
            {pickupStoragePath && (
              <p className="text-xs" style={{ color: "var(--accent)" }}>Bag photo uploaded</p>
            )}
          </div>

          <button
            className="btn-primary w-full"
            disabled={busy || !canCompletePickup}
            onClick={() =>
              run(() =>
                api.post(`/driver/orders/${oid}/pickup`, {
                  ...pos(),
                  order_confirmed: true,
                  storage_path: pickupStoragePath,
                })
              )
            }
            data-testid="pickup-btn"
          >
            <Package size={16} className="inline mr-2" />
            Picked Up – Heading to Customer
          </button>

          <button
            type="button"
            className="text-xs underline"
            style={{ color: "var(--muted)" }}
            onClick={() => setShowPickupProblem((v) => !v)}
            data-testid="pickup-problem-link"
          >
            Wrong order / problem at counter
          </button>
          {showPickupProblem && (
            <p className="text-xs rounded-lg p-2" style={{ background: "var(--surface)", color: "var(--muted)" }}>
              Do not mark picked up. Ask restaurant staff to verify the order number on the bag matches #{displayOrderNumber}.
              Contact support if the order is missing or incorrect.
            </p>
          )}
        </div>
      )}

      {["picked_up", "out_for_delivery"].includes(status) && (
        <button
          className="btn-primary w-full"
          disabled={busy || !coords}
          onClick={() => run(() => api.post(`/driver/orders/${oid}/arrive-customer`, pos()))}
          data-testid="arrive-customer-btn"
        >
          <MapPin size={16} className="inline mr-2" />
          Arrived at Customer
        </button>
      )}

      {["arrived_at_customer", "picked_up", "out_for_delivery"].includes(status) && prefs?.delivery_method === "leave_at_door" && (
        <div className="space-y-2">
          <label className="label-eyebrow flex items-center gap-1"><Camera size={12} /> Delivery photo</label>
          <input type="file" accept="image/*" capture="environment" className="text-sm w-full" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setErr("");
            try {
              const presign = await api.post(`/driver/orders/${oid}/delivery-photo/presign`, {});
              const path = presign?.data?.storage_path || presign?.storage_path;
              const uploadUrl = presign?.data?.upload_url || presign?.upload_url;
              if (!uploadUrl || !path) throw new Error("Could not prepare photo upload");
              await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
              setStoragePath(path);
            } catch (ex) {
              setErr(getApiErrorMessage(ex, "Photo upload failed"));
            }
          }} />
          <textarea className="input-field text-sm" rows={2} placeholder="Optional delivery note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            className="btn-primary w-full"
            disabled={busy || !storagePath || !coords}
            onClick={() => run(() => api.post(`/driver/orders/${oid}/complete`, { ...pos(), storage_path: storagePath, note }))}
            data-testid="complete-door-btn"
          >
            Complete Delivery
          </button>
        </div>
      )}

      {["arrived_at_customer", "picked_up", "out_for_delivery"].includes(status) && prefs?.delivery_method !== "leave_at_door" && (
        <div className="space-y-2">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Order #{displayOrderNumber} · {customerName}
          </div>
          {prefs?.pin_required && !verified && (
            <>
              <label className="label-eyebrow">Customer delivery PIN</label>
              <input
                className="input-field tracking-widest text-center text-lg"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                data-testid="delivery-pin-input"
              />
              <button
                className="btn-secondary w-full"
                disabled={busy || pin.length !== 6}
                onClick={() => run(async () => {
                  await api.post(`/driver/orders/${oid}/verify-pin`, { pin });
                  setVerified(true);
                })}
                data-testid="verify-pin-btn"
              >
                Verify PIN
              </button>
            </>
          )}
          <button
            className="btn-primary w-full"
            disabled={busy || !coords || (prefs?.pin_required && !verified)}
            onClick={() => run(() => api.post(`/driver/orders/${oid}/complete`, { ...pos(), note }))}
            data-testid="complete-handoff-btn"
          >
            Complete Delivery
          </button>
        </div>
      )}
    </div>
  );
}
