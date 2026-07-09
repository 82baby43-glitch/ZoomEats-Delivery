"use client";

import { supabase } from "@/lib/supabaseClient";
import type { MusicProvider } from "./types";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export function getCompanionOAuthRedirectUri() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/companion/oauth/callback`;
}

/** YouTube Music — redirect through Google using existing Supabase Google OAuth. */
export async function startYouTubeMusicGoogleOAuth() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("companion_music_pending", "youtube_music");
  const redirectTo = `${window.location.origin}/driver/companion?music_oauth=youtube_music`;
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

export async function finishPendingMusicOAuth(provider: MusicProvider): Promise<boolean> {
  const pending = sessionStorage.getItem("companion_music_pending");
  if (pending !== provider) return false;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;
  if (!token) return false;

  sessionStorage.removeItem("companion_music_pending");
  sessionStorage.setItem(`zoomeats_music_token_${provider}`, token);
  return true;
}

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
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodedRedirect}&scope=${scopes}&state=${encodedState}&prompt=consent`;
  }

  return null;
}

export function openMusicOAuth(url: string) {
  const popup = window.open(url, "companion_oauth", "width=520,height=720");
  if (!popup) {
    window.location.href = url;
    return "redirect";
  }
  return "popup";
}
