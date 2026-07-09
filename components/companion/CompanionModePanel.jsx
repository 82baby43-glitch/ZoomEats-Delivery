"use client";

import { useState } from "react";
import { Music, Headphones, Shield, Volume2, RefreshCw, CheckCircle2 } from "lucide-react";
import { useCompanionContext } from "./CompanionModeProvider";

const PROVIDERS = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
];

function providerLabel(id) {
  return PROVIDERS.find((p) => p.id === id)?.label || id;
}

export default function CompanionModePanel({ role = "driver" }) {
  const {
    settings,
    loading,
    error,
    providers,
    reload,
    connectProvider,
    confirmConnection,
    disconnect,
    updateSettings,
  } = useCompanionContext();
  const [connecting, setConnecting] = useState(null);
  const [connectStatus, setConnectStatus] = useState(null);

  const prefs = settings?.audio_preferences || { musicVolume: 70, duckingEnabled: true, safetyMode: false };

  const handleConnect = async (provider) => {
    const label = providerLabel(provider);
    setConnecting(provider);
    setConnectStatus(null);
    try {
      const res = await connectProvider(provider);

      if (res?.settings) {
        setConnectStatus({
          type: "success",
          message: `${label} connected. Use the floating player below to start music.`,
        });
        await reload();
        return;
      }

      if (res?.auth_url) {
        const popup = window.open(res.auth_url, "companion_oauth", "width=500,height=700");
        if (!popup) {
          setConnectStatus({
            type: "info",
            message: `Popup blocked. Tap here to sign in to ${label}.`,
            href: res.auth_url,
          });
          return;
        }
        setConnectStatus({
          type: "info",
          message: `Finish signing in to ${label} in the popup window.`,
        });
        return;
      }

      if (res?.client_oauth) {
        await confirmConnection(provider);
        setConnectStatus({
          type: "success",
          message: `${label} connected. Use the floating player below to start music.`,
        });
        await reload();
        return;
      }

      setConnectStatus({
        type: "error",
        message: `Could not connect ${label}. Please try again.`,
      });
    } catch (e) {
      setConnectStatus({
        type: "error",
        message: e instanceof Error ? e.message : `Could not connect ${label}`,
      });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    setConnectStatus(null);
    try {
      await disconnect();
      setConnectStatus({ type: "info", message: "Music provider disconnected." });
      await reload();
    } catch (e) {
      setConnectStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Could not disconnect",
      });
    }
  };

  if (loading && !settings) {
    return <div className="card p-6 text-center text-sm" style={{ color: "var(--muted)" }}>Loading Companion Mode…</div>;
  }

  return (
    <div className="space-y-6" data-testid="companion-mode-panel">
      {error && (
        <div
          className="card p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}
        >
          <p className="text-sm text-amber-200">{error}</p>
          <button type="button" className="btn-secondary text-sm" onClick={reload}>
            <RefreshCw size={14} className="inline mr-1" />
            Retry
          </button>
        </div>
      )}

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
        <div className="flex flex-wrap gap-2 mb-3">
          {PROVIDERS.map((p) => {
            const isConnected = settings?.music_provider === p.id && settings?.music_connected;
            return (
              <button
                key={p.id}
                type="button"
                className={isConnected ? "btn-primary" : "btn-secondary"}
                disabled={connecting === p.id}
                onClick={() => handleConnect(p.id)}
              >
                {connecting === p.id ? "Connecting…" : isConnected ? `${p.label} ✓` : p.label}
              </button>
            );
          })}
          {settings?.music_connected && (
            <button type="button" className="btn-ghost text-sm" onClick={handleDisconnect}>Disconnect</button>
          )}
        </div>

        {connectStatus && (
          <div
            className="rounded-lg px-3 py-2 text-sm mb-3"
            style={{
              background:
                connectStatus.type === "success"
                  ? "rgba(34,197,94,0.12)"
                  : connectStatus.type === "error"
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(59,130,246,0.12)",
              color:
                connectStatus.type === "success"
                  ? "#86efac"
                  : connectStatus.type === "error"
                    ? "#fca5a5"
                    : "#93c5fd",
            }}
          >
            {connectStatus.type === "success" && <CheckCircle2 size={14} className="inline mr-1" />}
            {connectStatus.href ? (
              <a href={connectStatus.href} target="_blank" rel="noopener noreferrer" className="underline">
                {connectStatus.message}
              </a>
            ) : (
              connectStatus.message
            )}
          </div>
        )}

        {settings?.music_connected && settings?.music_provider && (
          <p className="text-xs mb-3" style={{ color: "var(--primary)" }}>
            Active: {providerLabel(settings.music_provider)} — open the floating player at the bottom of the screen and press play.
          </p>
        )}

        {providers && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            OAuth via official APIs when configured — credentials stay on your device, never stored on ZoomEats servers.
            {providers.oauth_available?.spotify === false && " Spotify sign-in opens when OAuth is configured."}
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
