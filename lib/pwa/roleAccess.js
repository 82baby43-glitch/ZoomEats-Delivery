import {
  canAccessPath,
  getPostLoginPath,
  isPublicPath,
  resolveEffectiveRole,
} from "../auth/roleRouting";
import { roleMatches } from "../compliance/authz";

/** All signed-in users install the same ZoomEats PWA. */
export const PWA_APP_ROLES = {
  zoomeats: [
    "customer",
    "driver",
    "delivery",
    "restaurant_owner",
    "restaurant_staff",
    "vendor",
    "restaurant",
    "admin",
    "super_admin",
    "founder_driver",
    "dispatcher",
  ],
};

/**
 * Any authenticated user with a valid role may install ZoomEats.
 * @param {{ role?: string | null } | null | undefined} user
 * @param {string} [_appType]
 */
export function canUserAccessAppType(user, _appType = "zoomeats") {
  if (!user?.role) return false;
  return roleMatches(user.role, PWA_APP_ROLES.zoomeats);
}

/** @param {string} [role] */
export function appTypeForRole(_role) {
  return "customer";
}

/** Path-only dashboard URL on the primary domain. */
export function dashboardUrlForRole(user) {
  if (typeof user === "string") {
    return getPostLoginPath({ role: user });
  }
  return getPostLoginPath(user);
}

/** @param {{ role?: string | null } | null | undefined} user */
export function redirectUrlForUser(user) {
  return getPostLoginPath(user);
}

export function isPublicAuthPath(pathname) {
  return isPublicPath(pathname);
}

/**
 * Whether the signed-in user may access the current path (role from database).
 * @param {{ role?: string | null; founder_driver?: boolean; is_founder?: boolean } | null | undefined} user
 * @param {string} [_host]
 * @param {string} [pathname]
 */
export function userMatchesAppContext(user, _host, pathname = "/") {
  if (!user) return true;
  return canAccessPath(user, pathname);
}

export { resolveEffectiveRole, getPostLoginPath, canAccessPath };
