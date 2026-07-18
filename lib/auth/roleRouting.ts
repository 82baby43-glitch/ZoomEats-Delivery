import { normalizeRole, roleMatches } from "../compliance/authz";
import { hasMultiRolePrivileges } from "../founderDriver/auth";

export type ZoomEatsRole =
  | "customer"
  | "driver"
  | "restaurant_owner"
  | "restaurant_staff"
  | "admin"
  | "founder_driver"
  | "super_admin"
  | "dispatcher";

export type AuthUserLike = {
  role?: string | null;
  approval_status?: string | null;
  active?: boolean | null;
  founder_driver?: boolean | null;
  is_founder?: boolean | null;
  email?: string | null;
};

/** Post-login dashboard paths on zoomeats.net (no subdomains). */
export const ROLE_DASHBOARD_PATHS: Record<string, string> = {
  customer: "/",
  driver: "/driver/dashboard",
  delivery: "/driver/dashboard",
  founder_driver: "/admin/founder-driver",
  restaurant_owner: "/restaurant/dashboard",
  restaurant_staff: "/restaurant/dashboard",
  vendor: "/restaurant/dashboard",
  restaurant: "/restaurant/dashboard",
  admin: "/admin",
  super_admin: "/admin",
  dispatcher: "/admin",
};

/** Route prefixes each role may access (database role is source of truth). */
export const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  customer: ["/", "/cart", "/checkout", "/orders", "/account", "/r/", "/local-partners", "/dreamland"],
  driver: ["/driver", "/delivery", "/account", "/agreements", "/pending-approval", "/onboarding"],
  founder_driver: [
    "/admin/founder-driver",
    "/driver",
    "/delivery",
    "/account",
    "/agreements",
    "/pending-approval",
    "/onboarding",
  ],
  restaurant_owner: ["/restaurant", "/vendor", "/account", "/agreements", "/pending-approval", "/onboarding"],
  restaurant_staff: ["/restaurant", "/vendor", "/account", "/agreements", "/pending-approval", "/onboarding"],
  admin: ["/admin", "/account", "/agreements", "/onboarding"],
  super_admin: ["/admin", "/account", "/agreements", "/onboarding"],
  dispatcher: ["/admin", "/dispatcher", "/account"],
};

/** Route prefixes granted to founder multi-role accounts (admin + driver + customer). */
const FOUNDER_MULTI_ROLE_PREFIXES: string[] = [
  ...ROLE_ROUTE_ACCESS.admin,
  ...ROLE_ROUTE_ACCESS.driver,
  ...ROLE_ROUTE_ACCESS.customer,
  ...ROLE_ROUTE_ACCESS.founder_driver,
];

const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/offline",
  "/manifest.webmanifest",
  "/api/",
  "/onboarding",
  "/agreements",
  "/pending-approval",
];

export function isPublicPath(pathname: string): boolean {
  if (!pathname || pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Effective role used for routing. Founder flags are additive — they must not replace admin.
 */
export function resolveEffectiveRole(user: AuthUserLike | null | undefined): string {
  if (!user?.role && !user?.is_founder) return "customer";

  // Primary founder always retains admin dashboard access.
  if (user?.is_founder === true) return "admin";

  const raw = String(user.role || "").trim().toLowerCase();
  if (!raw) return "customer";

  if (raw === "super_admin") return "super_admin";
  if (raw === "admin") return "admin";
  if (raw === "dispatcher") return "dispatcher";

  // Legacy: founder_driver role was incorrectly used instead of admin+flags.
  if (raw === "founder_driver" && user.founder_driver === true) return "admin";
  if (raw === "founder_driver") return "founder_driver";

  if (raw === "restaurant_owner" || raw === "restaurant_staff") return raw;
  if (raw === "restaurant") return "restaurant_owner";
  if (raw === "driver") return "driver";

  const normalized = normalizeRole(raw);
  if (normalized === "delivery") return "driver";
  if (normalized === "vendor") return "restaurant_owner";
  if (normalized === "admin") return "admin";
  if (normalized === "dispatcher") return "dispatcher";
  return normalized || "customer";
}

export function getAccountStatus(user: AuthUserLike | null | undefined): string {
  if (!user) return "pending";
  if (user.active === false) return "suspended";
  return String(user.approval_status || "approved");
}

function isPrivilegedOperator(user: AuthUserLike | null | undefined): boolean {
  const effective = resolveEffectiveRole(user);
  return effective === "admin" || effective === "super_admin" || effective === "dispatcher";
}

export function isAccountActive(user: AuthUserLike | null | undefined): boolean {
  const status = getAccountStatus(user);
  if (isPrivilegedOperator(user)) {
    return status !== "suspended" && status !== "rejected";
  }
  return status !== "suspended" && status !== "rejected";
}

/** Dashboard path after successful authentication. */
export function getPostLoginPath(user: AuthUserLike | null | undefined): string {
  if (!user) return "/login";
  if (!isAccountActive(user)) return "/pending-approval";

  const effective = resolveEffectiveRole(user);
  return ROLE_DASHBOARD_PATHS[effective] || ROLE_DASHBOARD_PATHS.customer;
}

function prefixAllowed(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => {
    if (p === "/") return pathname === "/";
    return pathname === p || pathname.startsWith(p);
  });
}

/** Whether the user's database role may access a path. */
export function canAccessPath(user: AuthUserLike | null | undefined, pathname: string): boolean {
  if (!user) return isPublicPath(pathname);
  if (isPublicPath(pathname)) return true;

  // Founder multi-role: admin, driver, and customer surfaces without changing DB role.
  if (hasMultiRolePrivileges(user)) {
    return prefixAllowed(pathname, FOUNDER_MULTI_ROLE_PREFIXES);
  }

  const effective = resolveEffectiveRole(user);
  const allowed = ROLE_ROUTE_ACCESS[effective];
  if (!allowed) return effective === "customer" && prefixAllowed(pathname, ROLE_ROUTE_ACCESS.customer);

  if (prefixAllowed(pathname, allowed)) return true;

  // Shared customer browsing for non-partner roles
  if (effective !== "customer" && prefixAllowed(pathname, ["/cart", "/checkout", "/orders", "/r/"])) {
    return false;
  }

  return false;
}

/** Redirect signed-in users away from unauthorized areas. */
export function getRoleGuardRedirect(user: AuthUserLike | null | undefined, pathname: string): string | null {
  if (!user || isPublicPath(pathname)) return null;
  if (canAccessPath(user, pathname)) return null;
  return getPostLoginPath(user);
}

export function roleCanAccessRoute(userRole: string, allowedRoles: string[]): boolean {
  return roleMatches(userRole, allowedRoles);
}
