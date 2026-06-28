import { useEffect, useState, useCallback } from "react";

/**
 * Tiny wrapper around the Notification API.
 * - Returns { permission, request, fire } so callers can prompt + send
 * - No localStorage — `Notification.permission` is already persisted by the browser.
 */

export function useWebPush(appName = "ZoomEats") {
  const [permission, setPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  }, []);

  const fire = useCallback((title, body, opts = {}) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const n = new Notification(title, {
        body,
        tag: opts.tag || appName,
        renotify: true,
        silent: false,
        ...opts,
      });
      n.onclick = () => { window.focus(); n.close(); opts.onClick?.(); };
    } catch (e) {
      console.warn("[push] failed to fire notification:", e);
    }
  }, [appName]);

  return { permission, request, fire };
}
