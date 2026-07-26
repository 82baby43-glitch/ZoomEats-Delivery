import { normalizeRole } from "@/lib/compliance/authz";

/** Merchant demo / partner promo is homepage-only and hidden for customer & driver roles. */
export function shouldShowMerchantPromo(pathname: string, role?: string | null): boolean {
  if (pathname !== "/") return false;
  if (!role) return true;

  const normalized = normalizeRole(role);
  return normalized !== "customer" && normalized !== "delivery";
}
