/** @typedef {'customer' | 'driver' | 'restaurant'} PwaAppType */

export const PWA_APPS = {
  customer: {
    id: "customer",
    name: "ZoomEats",
    shortName: "ZoomEats",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/",
    scope: "/",
    installTitle: "Install ZoomEats on your phone for faster ordering",
    installButton: "Install ZoomEats",
    loginPath: "/login",
    dashboardPath: "/",
  },
  driver: {
    id: "driver",
    name: "ZoomEats Driver",
    shortName: "ZE Driver",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/driver/dashboard",
    scope: "/driver/",
    installTitle: "Install ZoomEats Driver for faster delivery alerts",
    installButton: "Install ZoomEats Driver",
    loginPath: "/driver/login",
    dashboardPath: "/driver/dashboard",
  },
  restaurant: {
    id: "restaurant",
    name: "ZoomEats Restaurant",
    shortName: "ZE Kitchen",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/restaurant/dashboard",
    scope: "/restaurant/",
    installTitle: "Install ZoomEats Restaurant to manage orders on the go",
    installButton: "Install ZoomEats Restaurant",
    loginPath: "/restaurant/login",
    dashboardPath: "/restaurant/dashboard",
  },
};

const STORAGE_KEY = "zoomeats_pwa_app";

/** @param {string | null | undefined} host */
export function detectAppTypeFromHost(host) {
  const h = (host || "").toLowerCase().split(":")[0];
  if (h.startsWith("driver.")) return "driver";
  if (h.startsWith("restaurant.")) return "restaurant";
  return "customer";
}

/** @param {string} pathname */
export function detectAppTypeFromPath(pathname) {
  if (pathname.startsWith("/driver") || pathname.startsWith("/delivery")) return "driver";
  if (pathname.startsWith("/restaurant") || pathname.startsWith("/vendor")) return "restaurant";
  return "customer";
}

/** @returns {PwaAppType} */
export function getClientAppType() {
  if (typeof window === "undefined") return "customer";
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && PWA_APPS[stored]) return stored;
  const fromHost = detectAppTypeFromHost(window.location.host);
  if (fromHost !== "customer") return fromHost;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("app");
  if (q && PWA_APPS[q]) return q;
  return detectAppTypeFromPath(window.location.pathname);
}

/** @param {PwaAppType} appType */
export function persistClientAppType(appType) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, appType);
}

export function getPwaConfig(appType = "customer") {
  return PWA_APPS[appType] || PWA_APPS.customer;
}

export function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
  );
}

export function getInstallDismissKey(appType) {
  return `zoomeats_pwa_install_dismissed_${appType}`;
}

export function getInstallSnoozeKey(appType) {
  return `zoomeats_pwa_install_snoozed_${appType}`;
}

export function isInstallSnoozed(appType) {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(getInstallSnoozeKey(appType)) === "1";
}

export function snoozeInstallPrompt(appType) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(getInstallSnoozeKey(appType), "1");
}

export function clearInstallSnooze(appType) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(getInstallSnoozeKey(appType));
}

export function getDeviceId() {
  if (typeof window === "undefined") return "server";
  const key = "zoomeats_pwa_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
