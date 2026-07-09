export const FOUNDER_DRIVER_ROLES = ["founder", "ceo", "ops_admin", "qa"] as const;
export type FounderDriverRole = (typeof FOUNDER_DRIVER_ROLES)[number];

export type FounderUser = {
  user_id: string;
  role?: string;
  email?: string;
  founder_driver?: boolean;
  founder_driver_role?: string | null;
};

export function hasFounderDriverPermission(user: FounderUser | null | undefined): boolean {
  if (!user) return false;
  return user.founder_driver === true || user.role === "admin";
}

export function isDeliveryRole(user: FounderUser | null | undefined): boolean {
  if (!user?.role) return false;
  return user.role === "delivery" || user.role === "driver";
}

/** Founder may operate driver endpoints when permission granted (additive — does not change role). */
export function canUseDriverApis(user: FounderUser | null | undefined): boolean {
  if (!user) return false;
  if (isDeliveryRole(user)) return true;
  return hasFounderDriverPermission(user);
}

export function canAccessFounderDashboard(user: FounderUser | null | undefined): boolean {
  return hasFounderDriverPermission(user);
}
