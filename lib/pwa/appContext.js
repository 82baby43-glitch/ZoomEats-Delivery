/** @typedef {'customer' | 'driver' | 'restaurant' | 'admin'} PwaAppType */

/** Single ZoomEats PWA — experience determined by database role after login. */
export const PWA_APPS = {
  customer: {
    id: "zoomeats",
    name: "ZoomEats",
    shortName: "ZoomEats",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/",
    scope: "/",
    installTitle: "Install ZoomEats for faster ordering and delivery",
    installButton: "Install ZoomEats",
    loginPath: "/login",
    dashboardPath: "/",
    description: "Food delivery in Columbia, Missouri — one app for customers, drivers, restaurants, and admins.",
  },
  driver: {
    id: "zoomeats",
    name: "ZoomEats",
    shortName: "ZoomEats",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/",
    scope: "/",
    installTitle: "Install ZoomEats for faster ordering and delivery",
    installButton: "Install ZoomEats",
    loginPath: "/login",
    dashboardPath: "/",
    description: "Food delivery in Columbia, Missouri — one app for customers, drivers, restaurants, and admins.",
  },
  restaurant: {
    id: "zoomeats",
    name: "ZoomEats",
    shortName: "ZoomEats",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/",
    scope: "/",
    installTitle: "Install ZoomEats for faster ordering and delivery",
    installButton: "Install ZoomEats",
    loginPath: "/login",
    dashboardPath: "/",
    description: "Food delivery in Columbia, Missouri — one app for customers, drivers, restaurants, and admins.",
  },
  admin: {
    id: "zoomeats",
    name: "ZoomEats",
    shortName: "ZoomEats",
    themeColor: "#B6F127",
    backgroundColor: "#0A0A0A",
    startUrl: "/",
    scope: "/",
    installTitle: "Install ZoomEats for faster ordering and delivery",
    installButton: "Install ZoomEats",
    loginPath: "/login",
    dashboardPath: "/",
    description: "Food delivery in Columbia, Missouri — one app for customers, drivers, restaurants, and admins.",
  },
};

const STORAGE_KEY = "zoomeats_pwa_app";

/**
 * App context from route prefix only — never from hostname/subdomain.
 * @param {string} pathname
 */
export function detectAppTypeFromPath(pathname) {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/driver") || pathname.startsWith("/delivery")) return "driver";
  if (pathname.startsWith("/restaurant") || pathname.startsWith("/vendor")) return "restaurant";
  return "customer";
}

/** @deprecated Hostname is not used for permissions. Always returns customer. */
export function detectAppTypeFromHost(_host) {
  return "customer";
}

/**
 * @param {string | null | undefined} _host
 * @param {string} [pathname]
 */
export function resolveAppType(_host, pathname = "/") {
  return detectAppTypeFromPath(pathname);
}

/** @returns {PwaAppType} */
export function getClientAppType() {
  if (typeof window === "undefined") return "customer";
  return detectAppTypeFromPath(window.location.pathname);
}

/** True when the current URL is a driver-facing route or app context. */
export function isDriverAppContext(pathname = "", appType = "customer", role = "customer") {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  return (
    appType === "driver" ||
    role === "delivery" ||
    role === "driver" ||
    role === "founder_driver" ||
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
  return PWA_APPS.customer;
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
