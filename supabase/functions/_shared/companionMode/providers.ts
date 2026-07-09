import type { MusicProvider } from "./types.ts";

const PROVIDER_LABELS: Record<MusicProvider, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
};

export function providerLabel(provider: MusicProvider) {
  return PROVIDER_LABELS[provider] || provider;
}

/** Build OAuth authorize URL — credentials stay client-side after redirect; server never stores tokens. */
export function buildMusicOAuthUrl(provider: MusicProvider, redirectUri: string, state: string): string | null {
  const encodedRedirect = encodeURIComponent(redirectUri);
  const encodedState = encodeURIComponent(state);

  if (provider === "spotify") {
    const clientId = process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    if (!clientId) return null;
    const scopes = encodeURIComponent("user-read-playback-state user-modify-playback-state user-read-currently-playing streaming");
    return `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodedRedirect}&scope=${scopes}&state=${encodedState}`;
  }

  if (provider === "youtube_music") {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const scopes = encodeURIComponent("https://www.googleapis.com/auth/youtube.readonly");
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodedRedirect}&scope=${scopes}&state=${encodedState}`;
  }

  if (provider === "apple_music") {
    // Apple Music uses MusicKit JS on the client; no server OAuth URL.
    return null;
  }

  return null;
}

export const SUPPORTED_PROVIDERS: MusicProvider[] = ["spotify", "apple_music", "youtube_music"];
