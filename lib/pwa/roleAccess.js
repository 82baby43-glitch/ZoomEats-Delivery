import { normalizeRole, roleMatches } from "../compliance/authz";
import { getPwaConfig, resolveAppType } from "./appContext";

/** Roles allowed to install/use each PWA context. */
export const PWA_APP_ROLES = {
  customer: ["customer"],
  driver: ["delivery", "driver"],
  restaurant: ["vendor", "restaurant"],
  admin: ["admin"],
};

/**
 * Whether the signed-in user's role may use/install this PWA app type.
 * @param {{ role?: string | null } | null | undefined} user
 * @param {string} appType
 */
export function canUserAccessAppType(user, appType) {
  if (!user?.role) return false;
  const allowed = PWA_APP_ROLES[appType];
  if (!allowed) return false;
  return roleMatches(user.role, allowed);
}

/**
 * Primary PWA / dashboard context for a user role.
 * @param {string} [role]
 * @returns {'customer' | 'driver' | 'restaurant' | 'admin'}
 */
export function appTypeForRole(role) {
  const normalized = normalizeRole(role || "customer");
  if (normalized === "delivery") return "driver";
  if (normalized === "vendor") return "restaurant";
  if (normalized === "admin") return "admin";
  return "customer";
}

function siteOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.zoomeats.net").replace(/\/$/, "");
}

/** Absolute home/dashboard URL for a role (subdomain-aware). */
export function dashboardUrlForRole(role) {
  const cfg = getPwaConfig(appTypeForRole(role));
  const path = cfg.dashboardPath || "/";
  const normalized = normalizeRole(role || "customer");

  if (normalized === "delivery") {
    return `https://driver.zoomeats.net${path}`;
  }
  if (normalized === "vendor") {
    return `https://restaurant.zoomeats.net${path}`;
  }
  if (normalized === "admin") {
    return `${siteOrigin()}${path}`;
  }
  return `${siteOrigin()}${path === "/" ? "" : path}` || siteOrigin();
}

/** Redirect target when user is on the wrong PWA context. */
export function redirectUrlForUser(user) {
  return dashboardUrlForRole(user?.role || "customer");
}

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/driver/login",
  "/restaurant/login",
  "/auth/callback",
  "/offline",
  "/manifest.webmanifest",
  "/api/",
  "/onboarding",
  "/agreements",
  "/pending-approval",
];

/**
 * Paths that stay reachable while signed out on role subdomains.
 * @param {string} pathname
 */
export function isPublicAuthPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * True when signed-in user belongs on the current host/path app context.
 * @param {{ role?: string | null } | null | undefined} user
 * @param {string} [host]
 * @param {string} [pathname]
 */
export function userMatchesAppContext(user, host, pathname = "/") {
  if (!user) return true;
  const appType = resolveAppType(host, pathname);
  return canUserAccessAppType(user, appType);
}
