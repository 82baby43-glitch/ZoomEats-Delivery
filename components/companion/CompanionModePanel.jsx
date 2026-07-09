"use client";

import { useState } from "react";
import { Music, Headphones, Shield, Volume2 } from "lucide-react";
import { useCompanionContext } from "./CompanionModeProvider";

const PROVIDERS = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
];

export default function CompanionModePanel({ role = "driver" }) {
  const { settings, loading, providers, connectProvider, confirmConnection, disconnect, updateSettings } = useCompanionContext();
  const [connecting, setConnecting] = useState<string | null>(null);

  const prefs = settings?.audio_preferences || { musicVolume: 70, duckingEnabled: true, safetyMode: false };

  const handleConnect = async (provider) => {
    setConnecting(provider);
    try {
      const res = await connectProvider(provider);
      if (res?.auth_url) {
        window.open(res.auth_url, "companion_oauth", "width=500,height=700");
      }
      if (res?.client_oauth || !res?.auth_url) {
        await confirmConnection(provider);
      }
    } finally {
      setConnecting(null);
    }
  };

  if (loading) {
    return <div className="card p-6 text-center text-sm" style={{ color: "var(--muted)" }}>Loading Companion Mode…</div>;
  }

  return (
    <div className="space-y-6" data-testid="companion-mode-panel">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Headphones size={18} style={{ color: "var(--accent)" }} />
          <h2 className="font-display text-xl font-bold">Companion Mode™</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          {role === "driver"
            ? "Background music, smart ducking, and safety controls while you deliver."
            : "Kitchen playlist and order alerts while you manage prep."}
        </p>

        <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Music size={14} /> Music service</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={settings?.music_provider === p.id && settings?.music_connected ? "btn-primary" : "btn-secondary"}
              disabled={connecting === p.id}
              onClick={() => handleConnect(p.id)}
            >
              {connecting === p.id ? "Connecting…" : p.label}
            </button>
          ))}
          {settings?.music_connected && (
            <button type="button" className="btn-ghost text-sm" onClick={disconnect}>Disconnect</button>
          )}
        </div>
        {providers && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            OAuth via official APIs only — credentials stay on your device, never stored on ZoomEats servers.
          </p>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Volume2 size={14} /> Audio settings</h3>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Music volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={prefs.musicVolume}
            onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })}
            className="w-40"
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Smart ducking (lower music for alerts)</span>
          <input
            type="checkbox"
            checked={prefs.duckingEnabled}
            onChange={(e) => updateSettings({ duckingEnabled: e.target.checked })}
          />
        </label>
        {role === "driver" && (
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2"><Shield size={14} /> Safety mode (large buttons + voice)</span>
            <input
              type="checkbox"
              checked={prefs.safetyMode}
              onChange={(e) => updateSettings({ safetyMode: e.target.checked })}
            />
          </label>
        )}
      </div>
    </div>
  );
}
