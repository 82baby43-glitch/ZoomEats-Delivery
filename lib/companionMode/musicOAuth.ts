"use client";

import { supabase } from "@/lib/supabaseClient";
import type { MusicProvider } from "./types";
import { getCompanionOAuthRedirectUri } from "./redirectUri";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export const GOOGLE_OAUTH_TESTING_HELP = [
  "Your Google Cloud OAuth app is in Testing mode.",
  "Add your Gmail address under Test users in Google Cloud Console → APIs & Services → OAuth consent screen.",
  "Also add this redirect URI under Credentials → your OAuth client → Authorized redirect URIs:",
  getCompanionOAuthRedirectUri(),
  "Until Google verifies the app, use ZoomEats Ambient for music without sign-in.",
].join(" ");

export { getCompanionOAuthRedirectUri };

export function buildClientMusicOAuthUrl(provider: MusicProvider, state: string): string | null {
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

  if (provider === "youtube_music") {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const scopes = encodeURIComponent(YOUTUBE_SCOPE);
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodedRedirect}&scope=${scopes}&state=${encodedState}&prompt=consent&include_granted_scopes=true`;
  }

  return null;
}

/** @deprecated Prefer direct OAuth via buildClientMusicOAuthUrl — avoids Supabase auth consent screen. */
export async function startYouTubeMusicGoogleOAuth() {
  if (typeof window === "undefined") return;
  const state = `music:youtube_music:${Date.now()}`;
  const url = buildClientMusicOAuthUrl("youtube_music", state);
  if (!url) throw new Error("Google OAuth is not configured for YouTube Music");
  sessionStorage.setItem("companion_music_pending", "youtube_music");
  window.location.href = url;
}

export function parseMusicOAuthError(params: URLSearchParams): string | null {
  const err = params.get("error") || params.get("music_oauth_error");
  if (!err) return null;
  if (err === "access_denied") {
    return `Google blocked sign-in (app is in Testing mode). Add your Gmail as a Test user in Google Cloud Console, or use ZoomEats Ambient below.`;
  }
  if (err === "redirect_uri_mismatch") {
    return `Google redirect URI mismatch. In Google Cloud Console → Credentials, add this exact URI: ${getCompanionOAuthRedirectUri()}`;
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
