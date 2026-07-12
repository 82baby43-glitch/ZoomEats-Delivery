import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { getClientAppType, getDeviceId } from "@/lib/pwa/appContext";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Web Push + foreground Notification API wrapper.
 * - Registers service worker push subscription when VAPID keys are configured
 * - Falls back to foreground Notification API
 */
export function useWebPush(appName = "ZoomEats") {
  const [permission, setPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  const subscribePush = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
    try {
      const keyRes = await api.get("/pwa/vapid-public-key");
      const publicKey = keyRes?.data?.publicKey || keyRes?.publicKey;
      if (!publicKey) return false;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await api.post("/pwa/push/subscribe", {
        subscription: sub.toJSON(),
        app_type: getClientAppType(),
        device_id: getDeviceId(),
        user_agent: navigator.userAgent,
      });
      setSubscribed(true);
      return true;
    } catch (e) {
      console.warn("[push] subscription failed:", e);
      return false;
    }
  }, []);

  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted") {
      await subscribePush();
      return "granted";
    }
    if (Notification.permission === "denied") return "denied";
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") await subscribePush();
    return p;
  }, [subscribePush]);

  const fire = useCallback((title, body, opts = {}) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const n = new Notification(title, {
        body,
        tag: opts.tag || appName,
        renotify: true,
        silent: false,
        icon: "/icons/icon-192.png",
        ...opts,
      });
      n.onclick = () => { window.focus(); n.close(); opts.onClick?.(); };
    } catch (e) {
      console.warn("[push] failed to fire notification:", e);
    }
  }, [appName]);

  return { permission, request, fire, subscribed, subscribePush };
}
