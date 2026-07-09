"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AudioPreferences, CompanionSettings, MusicProvider } from "@/lib/companionMode/types";
import { setBaseVolume } from "@/lib/companionMode/audioDucking";

export function useCompanionMode() {
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<{ providers: MusicProvider[]; oauth_available: Record<string, boolean> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api.get("/companion/settings"),
        api.get("/companion/music/providers"),
      ]);
      const data = s?.data as CompanionSettings | null;
      setSettings(data);
      setProviders((p?.data as { providers: MusicProvider[]; oauth_available: Record<string, boolean> }) || null);
      if (data?.audio_preferences?.musicVolume != null) {
        setBaseVolume(data.audio_preferences.musicVolume, data.audio_preferences);
      }
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateSettings = useCallback(async (patch: Partial<AudioPreferences>) => {
    const r = await api.patch("/companion/settings", { audio_preferences: patch });
    const data = r?.data as CompanionSettings;
    setSettings(data);
    if (patch.musicVolume != null) setBaseVolume(patch.musicVolume, data?.audio_preferences);
    return data;
  }, []);

  const connectProvider = useCallback(async (provider: MusicProvider, redirectUri?: string) => {
    const r = await api.post("/companion/music/connect", {
      provider,
      redirect_uri: redirectUri || `${window.location.origin}/companion/oauth/callback`,
    });
    return r?.data;
  }, []);

  const confirmConnection = useCallback(async (provider: MusicProvider) => {
    const r = await api.post("/companion/music/connect", { provider, confirmed: true });
    const payload = r?.data as { settings?: CompanionSettings } | null;
    const data = payload?.settings as CompanionSettings;
    setSettings(data);
    return data;
  }, []);

  const disconnect = useCallback(async () => {
    const r = await api.post("/companion/music/disconnect");
    const payload = r?.data as { settings?: CompanionSettings } | null;
    setSettings(payload?.settings || null);
  }, []);

  return {
    settings,
    loading,
    providers,
    reload: load,
    updateSettings,
    connectProvider,
    confirmConnection,
    disconnect,
  };
}
