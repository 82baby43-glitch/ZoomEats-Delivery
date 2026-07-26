"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playMerchantAlert, primeChime } from "@/lib/chime";
import {
  buildIncomingOrderAlertMessage,
  drainOfflineAlertQueue,
  getMerchantAlertScope,
  isIncomingUnacknowledged,
  loadMerchantAlertSettings,
  queueOfflineAlert,
  saveMerchantAlertSettings,
  sortIncomingOrders,
  type MerchantAlertSettings,
} from "@/lib/merchant/incomingOrderAlerts";
import { isPaymentConfirmed } from "@/lib/orderState";

type Order = {
  order_id: string;
  status?: string;
  payment_status?: unknown;
  created_at?: string;
  customer_name?: string;
  total?: number;
  delivery_type?: string;
};

type AlertBanner = {
  orderId: string;
  title: string;
  subtitle: string;
  etaLine: string;
  customerName?: string;
  total?: number;
};

type UseMerchantIncomingOrderAlertsOpts = {
  merchantId?: string | null;
  sandbox?: boolean;
  orders: Order[];
  prepMinutes?: number;
  primed?: boolean;
  onPush?: (title: string, body: string, opts?: { tag?: string; onClick?: () => void }) => void;
  onViewOrder?: (orderId: string) => void;
};

export function useMerchantIncomingOrderAlerts({
  merchantId,
  sandbox = false,
  orders,
  prepMinutes = 20,
  primed = true,
  onPush,
  onViewOrder,
}: UseMerchantIncomingOrderAlertsOpts) {
  const scope = getMerchantAlertScope(String(merchantId || ""), sandbox);
  const [settings, setSettings] = useState(() => loadMerchantAlertSettings(scope));
  const [banner, setBanner] = useState<AlertBanner | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const seenRef = useRef(new Set<string>());
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const primedRef = useRef(primed);

  useEffect(() => {
    primedRef.current = primed;
  }, [primed]);

  useEffect(() => {
    setSettings(loadMerchantAlertSettings(scope));
  }, [scope]);

  const unacknowledged = useMemo(
    () => orders.filter((o) => isIncomingUnacknowledged(o)),
    [orders]
  );

  const unacknowledgedCount = unacknowledged.length;
  const sortedOrders = useMemo(() => sortIncomingOrders(orders), [orders]);

  const triggerAlert = useCallback((order: Order, isRepeat = false) => {
    const msg = buildIncomingOrderAlertMessage(order, prepMinutes);
    setBanner({
      orderId: msg.orderId,
      title: msg.title,
      subtitle: msg.subtitle,
      etaLine: msg.etaLine,
      customerName: order.customer_name,
      total: order.total,
    });

    if (settings.soundEnabled) {
      primeChime();
      playMerchantAlert(isRepeat ? "beep" : settings.tone, settings.volume);
    }

    onPush?.(
      `🔔 ${msg.title}`,
      `${msg.subtitle}\n${msg.etaLine}${order.customer_name ? `\n${order.customer_name}` : ""}`,
      {
        tag: `merchant-order-${order.order_id}`,
        onClick: () => onViewOrder?.(order.order_id),
      }
    );
  }, [onPush, onViewOrder, prepMinutes, settings.soundEnabled, settings.tone, settings.volume]);

  const processNewOrders = useCallback((orderList: Order[], fromReconnect = false) => {
    if (!merchantId) return;

    const incoming = orderList.filter((o) => isIncomingUnacknowledged(o));
    const fresh = incoming.filter((o) => !seenRef.current.has(o.order_id));

    if (!primedRef.current && !fromReconnect) {
      incoming.forEach((o) => seenRef.current.add(o.order_id));
      return;
    }

    if (!isOnline) {
      fresh.forEach((o) => queueOfflineAlert(scope, o.order_id));
      return;
    }

    fresh.forEach((o) => {
      seenRef.current.add(o.order_id);
      triggerAlert(o, false);
    });
  }, [isOnline, merchantId, scope, triggerAlert]);

  useEffect(() => {
    processNewOrders(orders);
  }, [orders, processNewOrders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      setIsOnline(true);
      const queued = drainOfflineAlertQueue(scope);
      if (!queued.length) return;
      const matched = orders.filter((o) => queued.includes(o.order_id) && isPaymentConfirmed(o));
      matched.forEach((o) => triggerAlert(o, false));
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [orders, scope, triggerAlert]);

  useEffect(() => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }

    if (!unacknowledgedCount || !settings.soundEnabled) return;

    repeatRef.current = setInterval(() => {
      const next = unacknowledged[0];
      if (next) triggerAlert(next, true);
    }, settings.repeatIntervalSec * 1000);

    return () => {
      if (repeatRef.current) clearInterval(repeatRef.current);
    };
  }, [unacknowledged, unacknowledgedCount, settings.repeatIntervalSec, settings.soundEnabled, triggerAlert]);

  useEffect(() => {
    if (!banner) return;
    const stillActive = unacknowledged.some((o) => o.order_id === banner.orderId);
    if (!stillActive) setBanner(null);
  }, [banner, unacknowledged]);

  const updateSettings = useCallback((patch: Partial<MerchantAlertSettings>) => {
    const next = saveMerchantAlertSettings(scope, patch);
    setSettings(next);
    return next;
  }, [scope]);

  const testSound = useCallback(() => {
    primeChime();
    playMerchantAlert(settings.tone, settings.volume);
  }, [settings.tone, settings.volume]);

  const dismissBanner = useCallback((orderId: string) => {
    setBanner((b) => (b?.orderId === orderId ? null : b));
    onViewOrder?.(orderId);
  }, [onViewOrder]);

  const isPulsing = useCallback((orderId: string) => {
    return unacknowledged.some((o) => o.order_id === orderId);
  }, [unacknowledged]);

  return {
    settings,
    updateSettings,
    testSound,
    banner,
    dismissBanner,
    unacknowledgedCount,
    sortedOrders,
    isPulsing,
    isOnline,
    scope,
  };
}
