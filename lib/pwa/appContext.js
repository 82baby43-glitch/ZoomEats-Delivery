/** @typedef {'customer' | 'driver' | 'restaurant' | 'admin'} PwaAppType */

export const PWA_APPS = {
  customer: {
    id: "customer",
    name: "ZoomEats Customer",
    shortName: "ZoomEats Customer",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/",
    scope: "/",
    installTitle: "Install ZoomEats Customer for faster ordering",
    installButton: "Install ZoomEats Customer",
    loginPath: "/login",
    dashboardPath: "/",
    description: "Order food from local restaurants with ZoomEats Customer.",
  },
  driver: {
    id: "driver",
    name: "ZoomEats Driver",
    shortName: "ZoomEats Driver",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/driver/dashboard",
    scope: "/driver/",
    installTitle: "Install ZoomEats Driver for delivery alerts and navigation",
    installButton: "Install ZoomEats Driver",
    loginPath: "/driver/login",
    dashboardPath: "/driver/dashboard",
    description: "Deliver with ZoomEats Driver — offers, navigation, and payouts.",
  },
  restaurant: {
    id: "restaurant",
    name: "ZoomEats Restaurant",
    shortName: "ZoomEats Restaurant",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/restaurant/dashboard",
    scope: "/restaurant/",
    installTitle: "Install ZoomEats Restaurant to manage orders on the go",
    installButton: "Install ZoomEats Restaurant",
    loginPath: "/restaurant/login",
    dashboardPath: "/restaurant/dashboard",
    description: "Run your kitchen with ZoomEats Restaurant order management.",
  },
  admin: {
    id: "admin",
    name: "ZoomEats Admin",
    shortName: "ZoomEats Admin",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/admin",
    scope: "/admin/",
    installTitle: "Install ZoomEats Admin for on-the-go operations",
    installButton: "Install ZoomEats Admin",
    loginPath: "/login",
    dashboardPath: "/admin",
    description: "Operate ZoomEats with admin tools, approvals, and analytics.",
  },
};

const STORAGE_KEY = "zoomeats_pwa_app";

/** @param {string | null | undefined} host */
export function detectAppTypeFromHost(host) {
  const h = (host || "").toLowerCase().split(":")[0];
  if (h.startsWith("driver.")) return "driver";
  if (h.startsWith("restaurant.")) return "restaurant";
  if (h.startsWith("admin.")) return "admin";
  return "customer";
}

/** @param {string} pathname */
export function detectAppTypeFromPath(pathname) {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/driver") || pathname.startsWith("/delivery")) return "driver";
  if (pathname.startsWith("/restaurant") || pathname.startsWith("/vendor")) return "restaurant";
  return "customer";
}

/**
 * Resolve app context from subdomain first, then route prefix on apex/www.
 * @param {string | null | undefined} host
 * @param {string} [pathname]
 * @returns {PwaAppType}
 */
export function resolveAppType(host, pathname = "/") {
  const fromHost = detectAppTypeFromHost(host);
  if (fromHost !== "customer") return fromHost;
  return detectAppTypeFromPath(pathname);
}

/** @returns {PwaAppType} */
export function getClientAppType() {
  if (typeof window === "undefined") return "customer";
  const fromHost = detectAppTypeFromHost(window.location.host);
  if (fromHost !== "customer") return fromHost;
  const fromPath = detectAppTypeFromPath(window.location.pathname);
  if (fromPath !== "customer") return fromPath;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && PWA_APPS[stored]) return stored;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("app");
  if (q && PWA_APPS[q]) return q;
  return "customer";
}

/** True when the current URL is a driver-facing route or app context. */
export function isDriverAppContext(pathname = "", appType = "customer", role = "customer") {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  return (
    appType === "driver" ||
    role === "delivery" ||
    path.startsWith("/driver") ||
    path.startsWith("/delivery")
  );
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

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
  return isIos && isSafari;
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
