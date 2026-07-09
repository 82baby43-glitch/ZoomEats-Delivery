import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDuckingPayload,
  connectAmbientPlayback,
  connectMusicProvider,
  disconnectMusicProvider,
  ensureCompanionSettings,
  getCompanionSettings,
  restoreAudioVolume,
  updateAudioSettings,
} from "./service.ts";
import { buildMusicOAuthUrl, SUPPORTED_PROVIDERS } from "./providers.ts";
import type { CompanionRole, MusicProvider } from "./types.ts";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type Ctx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
};

function resolveRole(user: Record<string, unknown>): CompanionRole | null {
  const role = String(user.role || "").toLowerCase();
  if (role === "delivery" || role === "driver") return "driver";
  if (role === "vendor" || role === "restaurant") return "restaurant";
  if (role === "admin") return "driver";
  if (user.founder_driver === true) return "driver";
  return null;
}

export async function handleCompanionRequest(
  db: SupabaseClient,
  ctx: Ctx
): Promise<unknown | null> {
  const { path, method, body = {} } = ctx;

  if (!path.startsWith("/companion")) return null;

  const user = ctx.requireAuth();
  const userId = String(user.user_id);
  const role = resolveRole(user);

  if (path === "/companion/settings" && method === "GET") {
    const settings = role ? await ensureCompanionSettings(db, userId, role) : await getCompanionSettings(db, userId);
    return settings || { user_id: userId, role, music_connected: false, audio_preferences: { musicVolume: 70, duckingEnabled: true, safetyMode: false } };
  }

  if (path === "/companion/settings" && (method === "PATCH" || method === "POST")) {
    if (!role) throwErr("Companion Mode requires driver or restaurant role", 403);
    const patch = (body.audio_preferences && typeof body.audio_preferences === "object")
      ? body.audio_preferences as Record<string, unknown>
      : body;
    return updateAudioSettings(db, userId, role, {
      musicVolume: patch.musicVolume != null ? Number(patch.musicVolume) : undefined,
      duckingEnabled: patch.duckingEnabled != null ? !!patch.duckingEnabled : undefined,
      safetyMode: patch.safetyMode != null ? !!patch.safetyMode : undefined,
      duckVolume: patch.duckVolume != null ? Number(patch.duckVolume) : undefined,
    });
  }

  if (path === "/companion/music/providers" && method === "GET") {
    return {
      providers: SUPPORTED_PROVIDERS,
      oauth_available: {
        spotify: !!(process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID),
        apple_music: true,
        youtube_music: !!(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
      },
    };
  }

  if (path === "/companion/music/connect" && method === "POST") {
    if (!role) throwErr("Companion Mode requires driver or restaurant role", 403);
    const provider = String(body.provider || "") as MusicProvider;
    if (body.mode === "ambient") {
      const settings = await connectAmbientPlayback(db, userId, role);
      return {
        ok: true,
        settings,
        mode: "ambient",
        message: "ZoomEats Ambient playback enabled (no external account required)",
      };
    }

    if (!SUPPORTED_PROVIDERS.includes(provider)) throwErr("Invalid music provider");

    const redirectUri = String(body.redirect_uri || "").trim();
    const state = `${userId}:${provider}:${Date.now()}`;
    const authUrl = redirectUri ? buildMusicOAuthUrl(provider, redirectUri, state) : null;

    if (body.confirmed === true) {
      const settings = await connectMusicProvider(db, userId, role, provider);
      return {
        ok: true,
        settings,
        message: "Music provider connected — token stored on device only",
      };
    }

    if (provider === "youtube_music" && !authUrl) {
      return {
        provider,
        use_supabase_google_oauth: true,
        message: "Redirect to Google to authorize YouTube Music access",
      };
    }

    if (!authUrl) {
      return {
        provider,
        oauth_required: true,
        oauth_available: false,
        message: provider === "spotify"
          ? "Spotify OAuth is not configured. Use YouTube Music (Google sign-in) or ZoomEats Ambient."
          : "Use ZoomEats Ambient for built-in playback, or connect YouTube Music with Google.",
      };
    }

    return {
      provider,
      auth_url: authUrl,
      state,
      client_oauth: provider === "apple_music",
      message: "Open auth_url to authorize — store token in device session only",
    };
  }

  if (path === "/companion/music/disconnect" && method === "POST") {
    const settings = await disconnectMusicProvider(db, userId);
    return { ok: true, settings };
  }

  if (path === "/companion/ducking/trigger" && method === "POST") {
    if (!role) throwErr("Companion Mode requires driver or restaurant role", 403);
    const settings = await ensureCompanionSettings(db, userId, role);
    const eventType = String(body.event_type || "delivery_created");
    const message = String(body.message || "ZoomEats notification");
    const payload = buildDuckingPayload(eventType, message, body.order_id ? String(body.order_id) : undefined);
    return {
      ok: true,
      ducking: payload,
      restore: restoreAudioVolume(settings.audio_preferences),
    };
  }

  if (path === "/companion/ducking/restore" && method === "POST") {
    const settings = await getCompanionSettings(db, userId);
    return {
      ok: true,
      restore: restoreAudioVolume(settings?.audio_preferences || { musicVolume: 70, duckingEnabled: true, safetyMode: false }),
    };
  }

  throwErr("Not found", 404);
}
