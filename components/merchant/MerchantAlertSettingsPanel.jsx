"use client";

import { Volume2, VolumeX } from "lucide-react";

export default function MerchantAlertSettingsPanel({ settings, onChange, onTest }) {
  return (
    <div className="card p-5 max-w-md space-y-4" data-testid="merchant-alert-settings">
      <div>
        <h3 className="font-display text-lg font-bold">Order alert sounds</h3>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Applies to all merchant types. Alerts repeat until you accept or reject the order.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 text-sm font-medium">
        <span className="flex items-center gap-2">
          {settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          Sound enabled
        </span>
        <input
          type="checkbox"
          checked={settings.soundEnabled}
          onChange={(e) => onChange({ soundEnabled: e.target.checked })}
        />
      </label>

      <div>
        <label className="label-eyebrow">Volume</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          disabled={!settings.soundEnabled}
          onChange={(e) => onChange({ volume: parseFloat(e.target.value) })}
          className="w-full accent-[#C6FF00]"
        />
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{Math.round(settings.volume * 100)}%</div>
      </div>

      <div>
        <label className="label-eyebrow">Repeat interval (seconds)</label>
        <input
          type="range"
          min={15}
          max={30}
          step={5}
          value={settings.repeatIntervalSec}
          disabled={!settings.soundEnabled}
          onChange={(e) => onChange({ repeatIntervalSec: parseInt(e.target.value, 10) })}
          className="w-full accent-[#C6FF00]"
        />
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Every {settings.repeatIntervalSec}s until acknowledged</div>
      </div>

      <div>
        <label className="label-eyebrow">Notification tone</label>
        <select
          className="input-field"
          value={settings.tone}
          disabled={!settings.soundEnabled}
          onChange={(e) => onChange({ tone: e.target.value })}
        >
          <option value="chime">Chime (default)</option>
          <option value="beep">Beep</option>
        </select>
      </div>

      <button type="button" className="btn-primary w-full" onClick={onTest}>
        Test notification sound
      </button>
    </div>
  );
}
