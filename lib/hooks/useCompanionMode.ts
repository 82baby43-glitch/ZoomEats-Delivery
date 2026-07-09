"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AudioPreferences, CompanionSettings, MusicProvider } from "@/lib/companionMode/types";
import { DEFAULT_AUDIO_PREFERENCES } from "@/lib/companionMode/types";
import { setBaseVolume } from "@/lib/companionMode/audioDucking";

const LOCAL_FALLBACK_SETTINGS: CompanionSettings = {
  id: "local_fallback",
  user_id: "",
  role: "driver",
  music_provider: null,
  music_connected: false,
  audio_preferences: DEFAULT_AUDIO_PREFERENCES,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function useCompanionMode() {
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{
    providers: MusicProvider[];
    oauth_available: Record<string, boolean>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        api.get("/companion/settings"),
        api.get("/companion/music/providers"),
      ]);
      const data = s?.data as CompanionSettings | null;
      const normalized = data?.audio_preferences
        ? data
        : { ...LOCAL_FALLBACK_SETTINGS, ...(data || {}) };
      setSettings(normalized);
      setProviders(
        (p?.data as { providers: MusicProvider[]; oauth_available: Record<string, boolean> }) || null,
      );
      if (normalized.audio_preferences?.musicVolume != null) {
        setBaseVolume(normalized.audio_preferences.musicVolume, normalized.audio_preferences);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load Companion Mode";
      setError(msg);
      setSettings((prev) => prev ?? LOCAL_FALLBACK_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateSettings = useCallback(async (patch: Partial<AudioPreferences>) => {
    setError(null);
    try {
      let r;
      try {
        r = await api.patch("/companion/settings", { audio_preferences: patch });
      } catch {
        r = await api.post("/companion/settings", { audio_preferences: patch });
      }
      const data = r?.data as CompanionSettings;
      setSettings(data);
      if (patch.musicVolume != null) setBaseVolume(patch.musicVolume, data?.audio_preferences);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save settings";
      setError(msg);
      setSettings((prev) => {
        const base = prev ?? LOCAL_FALLBACK_SETTINGS;
        const merged = {
          ...base,
          audio_preferences: { ...base.audio_preferences, ...patch },
        };
        if (patch.musicVolume != null) setBaseVolume(patch.musicVolume, merged.audio_preferences);
        return merged;
      });
      throw e;
    }
  }, []);

  const connectProvider = useCallback(async (provider: MusicProvider, redirectUri?: string) => {
    setError(null);
    try {
      const r = await api.post("/companion/music/connect", {
        provider,
        redirect_uri: redirectUri || `${window.location.origin}/companion/oauth/callback`,
      });
      const payload = r?.data as {
        settings?: CompanionSettings;
        auth_url?: string | null;
        auto_connected?: boolean;
        message?: string;
      } | null;
      if (payload?.settings) {
        setSettings(payload.settings);
      }
      return payload;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not connect music provider";
      setError(msg);
      throw e;
    }
  }, []);

  const confirmConnection = useCallback(async (provider: MusicProvider) => {
    setError(null);
    try {
      const r = await api.post("/companion/music/connect", { provider, confirmed: true });
      const payload = r?.data as { settings?: CompanionSettings } | CompanionSettings | null;
      const data = (
        payload && typeof payload === "object" && "settings" in payload
          ? payload.settings
          : payload
      ) as CompanionSettings | undefined;
      if (!data?.audio_preferences) {
        throw new Error("Could not confirm music connection");
      }
      setSettings(data);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not confirm music connection";
      setError(msg);
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      const r = await api.post("/companion/music/disconnect");
      const payload = r?.data as { settings?: CompanionSettings } | null;
      setSettings(payload?.settings || null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not disconnect music provider";
      setError(msg);
      throw e;
    }
  }, []);

  return {
    settings,
    loading,
    error,
    providers,
    reload: load,
    updateSettings,
    connectProvider,
    confirmConnection,
    disconnect,
  };
}
