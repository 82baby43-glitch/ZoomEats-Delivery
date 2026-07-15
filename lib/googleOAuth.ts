"use client";

const NONCE_KEY = "google_oauth_nonce";
const PKCE_KEY = "google_pkce_verifier";
const REDIRECT_URI_KEY = "google_oauth_redirect_uri";

export function getGoogleClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || undefined;
}

export function isBrandedGoogleOAuthEnabled(): boolean {
  return Boolean(getGoogleClientId());
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Raw nonce for Supabase + SHA-256 hex hash for Google (Supabase docs). */
export async function generateGoogleNonce(): Promise<{ nonce: string; hashedNonce: string }> {
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const challenge = base64Url(new Uint8Array(hashBuffer));
  return { verifier, challenge };
}

export function getGoogleOAuthRedirectUri(origin?: string): string {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "https://www.zoomeats.net");
  return `${base.replace(/\/$/, "")}/auth/callback/google`;
}

/** Redirect to Google OAuth on the ZoomEats domain (not supabase.co). */
export async function startBrandedGoogleSignIn(): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured");
  }

  const { nonce, hashedNonce } = await generateGoogleNonce();
  const { verifier, challenge } = await generatePkce();
  const redirectUri = getGoogleOAuthRedirectUri();

  sessionStorage.setItem(NONCE_KEY, nonce);
  sessionStorage.setItem(PKCE_KEY, verifier);
  sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    nonce: hashedNonce,
    prompt: "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: crypto.randomUUID(),
  });

  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export function consumeStoredGoogleOAuthState(): {
  nonce: string;
  verifier: string;
  redirectUri: string;
} | null {
  const nonce = sessionStorage.getItem(NONCE_KEY);
  const verifier = sessionStorage.getItem(PKCE_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY);
  sessionStorage.removeItem(NONCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);
  if (!nonce || !verifier || !redirectUri) return null;
  return { nonce, verifier, redirectUri };
}

/** Exchange authorization code for ID token (PKCE, public client). */
export async function exchangeGoogleAuthCode(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<string> {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error("Google client ID not configured");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.id_token) {
    throw new Error(data.error_description || data.error || "Google token exchange failed");
  }
  return data.id_token;
}
