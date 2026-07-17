import { normalizeRole, roleMatches } from "./complianceAuthz.ts";

export const PWA_APP_ROLES: Record<string, string[]> = {
  customer: ["customer"],
  driver: ["delivery", "driver"],
  restaurant: ["vendor", "restaurant"],
  admin: ["admin"],
};

export function canUserAccessAppType(
  user: { role?: string | null } | null | undefined,
  appType: string
): boolean {
  if (!user?.role) return false;
  const allowed = PWA_APP_ROLES[appType];
  if (!allowed) return false;
  return roleMatches(user.role, allowed);
}
