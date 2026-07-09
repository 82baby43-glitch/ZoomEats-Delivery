"use client";

import { supabase } from "@/lib/supabaseClient";
import type { MusicProvider } from "./types";
import { CANONICAL_APP_URL, getCompanionOAuthRedirectUri } from "./redirectUri";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

/** Supabase Google OAuth callback — already registered in Google Cloud for ZoomEats login. */
export function getSupabaseGoogleCallback(): string {
  const base = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  return base ? `${base}/auth/v1/callback` : "";
}

export function getCompanionReturnUrl() {
  const base = CANONICAL_APP_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return `${origin}/driver/companion`;
    }
  }
  return `${base}/driver/companion`;
}

export const GOOGLE_OAUTH_TESTING_HELP = [
  "Your Google Cloud OAuth app is in Testing mode.",
  "Add your Gmail under OAuth consent screen → Test users (e.g. alexanderrymelo@gmail.com).",
  `YouTube Music uses the registered Supabase callback (same as ZoomEats Google login).`,
  "Until Google verifies the app, use ZoomEats Ambient for music without sign-in.",
].join(" ");

export { getCompanionOAuthRedirectUri };

/**
 * YouTube Music via Supabase Google OAuth — uses the Supabase redirect URI that is
 * already registered in Google Cloud (avoids redirect_uri_mismatch).
 */
export async function startYouTubeMusicGoogleOAuth() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("companion_music_pending", "youtube_music");
  const redirectTo = `${getCompanionReturnUrl()}?music_oauth=youtube_music`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: YOUTUBE_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) throw error;
}

/** Spotify only — YouTube must use startYouTubeMusicGoogleOAuth (Supabase path). */
export function buildClientMusicOAuthUrl(provider: MusicProvider, state: string): string | null {
  if (provider === "youtube_music") return null;

  const redirectUri = getCompanionOAuthRedirectUri();
  const encodedRedirect = encodeURIComponent(redirectUri);
  const encodedState = encodeURIComponent(state);

  if (provider === "spotify") {
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    if (!clientId) return null;
    const scopes = encodeURIComponent(
      "user-read-playback-state user-modify-playback-state user-read-currently-playing streaming",
    );
    return `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodedRedirect}&scope=${scopes}&state=${encodedState}`;
  }

  return null;
}

export function parseMusicOAuthError(params: URLSearchParams): string | null {
  const err = params.get("error") || params.get("music_oauth_error");
  if (!err) return null;
  if (err === "access_denied") {
    return "Google blocked sign-in. Your Gmail must be added as a Test user in Google Cloud Console → OAuth consent screen → Test users. Or use ZoomEats Ambient below.";
  }
  if (err === "redirect_uri_mismatch") {
    return `Google redirect URI mismatch. YouTube Music should use Supabase sign-in — hard refresh and try again. If it persists, verify your Supabase auth callback is in Google Cloud Credentials.`;
  }
  const desc = params.get("error_description");
  return desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : `Music sign-in failed (${err})`;
}

export async function finishPendingMusicOAuth(provider: MusicProvider): Promise<boolean> {
  const pending = sessionStorage.getItem("companion_music_pending");
  if (pending !== provider) return false;

  const token = sessionStorage.getItem(`zoomeats_music_token_${provider}`);
  if (token) {
    sessionStorage.removeItem("companion_music_pending");
    return true;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const providerToken = session?.provider_token;
  if (!providerToken) return false;

  sessionStorage.removeItem("companion_music_pending");
  sessionStorage.setItem(`zoomeats_music_token_${provider}`, providerToken);
  return true;
}

export function openMusicOAuth(url: string, provider?: MusicProvider) {
  if (provider) sessionStorage.setItem("companion_music_pending", provider);
  const popup = window.open(url, "companion_oauth", "width=520,height=720");
  if (!popup) {
    window.location.href = url;
    return "redirect";
  }
  return "popup";
}
