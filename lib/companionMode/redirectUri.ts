/** Canonical production URL — OAuth redirect URIs must match Google Cloud Console exactly. */
export const CANONICAL_APP_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL) ||
  "https://zoom-eats-delivery.vercel.app";

export function getCompanionOAuthRedirectUri(): string {
  const base = CANONICAL_APP_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return `${origin}/companion/oauth/callback`;
    }
  }
  return `${base}/companion/oauth/callback`;
}
