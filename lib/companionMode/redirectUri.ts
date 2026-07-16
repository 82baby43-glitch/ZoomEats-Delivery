import { PRODUCTION_SITE_ORIGIN, isLocalDevOrigin } from "@/lib/siteUrl";

export const CANONICAL_APP_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL) || PRODUCTION_SITE_ORIGIN;

export function getCompanionOAuthRedirectUri(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    if (isLocalDevOrigin(origin)) {
      return `${origin}/companion/oauth/callback`;
    }
  }
  return `${CANONICAL_APP_URL.replace(/\/$/, "")}/companion/oauth/callback`;
}
