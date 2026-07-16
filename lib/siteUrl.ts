/**
 * Canonical production site URL for auth redirects, SEO, and OAuth.
 * Production: https://zoomeats.net (apex)
 */
export const PRODUCTION_SITE_ORIGIN =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) ||
  "https://zoomeats.net";

export function isLocalDevOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/.test(origin);
}

/** Origin for the current environment (browser) or production default (SSR). */
export function getSiteOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return PRODUCTION_SITE_ORIGIN;
}

/** OAuth/email callback — localhost in dev, canonical apex in production. */
export function getAuthCallbackUrl(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    if (isLocalDevOrigin(origin)) {
      return `${origin}/auth/callback`;
    }
  }
  return `${PRODUCTION_SITE_ORIGIN}/auth/callback`;
}

/** Post-login redirect target passed to Supabase OAuth (must match Supabase allow list). */
export function getOAuthRedirectTo(): string {
  return getAuthCallbackUrl();
}
