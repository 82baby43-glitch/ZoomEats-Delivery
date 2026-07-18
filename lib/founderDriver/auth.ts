import { normalizeRole } from "../compliance/authz";
import { getAdminEmails } from "../adminEnv";

export const FOUNDER_DRIVER_ROLES = ["founder", "ceo", "ops_admin", "qa"] as const;
export type FounderDriverRole = (typeof FOUNDER_DRIVER_ROLES)[number];

export type FounderUser = {
  user_id?: string;
  role?: string | null;
  roles?: string[] | null;
  email?: string | null;
  founder_driver?: boolean | null;
  founder_driver_role?: string | null;
  is_founder?: boolean | null;
};

/** Safely collect primary + alias roles from a user record. */
export function resolveUserRoles(user: FounderUser | null | undefined): string[] {
  if (!user) return [];
  const out = new Set<string>();
  const primary = String(user.role || "").trim();
  if (primary) {
    out.add(primary);
    out.add(normalizeRole(primary));
  }
  if (Array.isArray(user.roles)) {
    for (const raw of user.roles) {
      const role = String(raw || "").trim();
      if (!role) continue;
      out.add(role);
      out.add(normalizeRole(role));
    }
  }
  return [...out].filter(Boolean);
}

export function userHasRole(
  user: FounderUser | null | undefined,
  ...roles: string[]
): boolean {
  const userRoles = resolveUserRoles(user);
  const expanded = roles.flatMap((r) => [r, normalizeRole(r)]);
  return expanded.some((r) => userRoles.includes(r));
}

/** Primary ZoomEats founder flag or explicit founder-driver permission. */
export function hasFounderPrivileges(user: FounderUser | null | undefined): boolean {
  if (!user) return false;
  return user.is_founder === true || user.founder_driver === true;
}

/** Admin role combined with founder access (flag, allowlist, or legacy admin grant). */
export function hasAdminFounderAccess(
  user: FounderUser | null | undefined,
  adminEmails: string[] = getAdminEmails()
): boolean {
  if (!user || !userHasRole(user, "admin")) return false;
  if (hasFounderPrivileges(user)) return true;
  const email = String(user.email || "").toLowerCase();
  return Boolean(email && adminEmails.includes(email));
}

export function hasFounderDriverPermission(
  user: FounderUser | null | undefined,
  adminEmails: string[] = getAdminEmails()
): boolean {
  if (!user) return false;
  if (userHasRole(user, "founder_driver")) return true;
  if (hasFounderPrivileges(user)) return true;
  if (hasAdminFounderAccess(user, adminEmails)) return true;
  // Legacy: admins granted founder_driver via migration may rely on role alone.
  if (userHasRole(user, "admin") && user.founder_driver !== false) return true;
  return false;
}

export function isDeliveryRole(user: FounderUser | null | undefined): boolean {
  if (!user) return false;
  return userHasRole(user, "delivery", "driver", "founder_driver");
}

/** Founder may operate driver endpoints when permission granted (additive — does not change role). */
export function canUseDriverApis(
  user: FounderUser | null | undefined,
  adminEmails: string[] = getAdminEmails()
): boolean {
  if (!user) return false;
  if (isDeliveryRole(user)) return true;
  return hasFounderDriverPermission(user, adminEmails);
}

export function canAccessFounderDashboard(
  user: FounderUser | null | undefined,
  adminEmails: string[] = getAdminEmails()
): boolean {
  return hasFounderDriverPermission(user, adminEmails);
}

/** Whether a required role list includes driver/delivery access. */
export function rolesRequireDelivery(...roles: string[]): boolean {
  return roles.some((r) => {
    const n = normalizeRole(r);
    return n === "delivery" || r === "driver";
  });
}

/** API / gate helper: allow delivery role OR verified founder driver access. */
export function satisfiesRoleRequirement(
  user: FounderUser | null | undefined,
  roles: string[],
  adminEmails: string[] = getAdminEmails()
): boolean {
  if (!user) return false;
  if (userHasRole(user, ...roles)) return true;
  if (rolesRequireDelivery(...roles) && canUseDriverApis(user, adminEmails)) return true;
  return false;
}

export function isFounderAccount(user: FounderUser | null | undefined): boolean {
  return user?.is_founder === true;
}

/** Founder / admin accounts that may use customer, driver, and admin surfaces simultaneously. */
export function hasMultiRolePrivileges(user: FounderUser | null | undefined): boolean {
  if (!user) return false;
  if (user.is_founder === true) return true;
  if (user.founder_driver === true && userHasRole(user, "admin", "super_admin")) return true;
  return false;
}
