"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, Volume2 } from "lucide-react";
import {
  getLocalMusicEq,
  setLocalMusicEq,
} from "@/lib/companionMode/localMusic";

const EQ_BANDS = [
  { key: "bass", label: "Bass", hint: "Low" },
  { key: "mid", label: "Mid", hint: "Vocals" },
  { key: "treble", label: "Treble", hint: "High" },
];

export default function SoundControlStation({ volume, onVolume, disabled = false }) {
  const [eq, setEq] = useState(() => getLocalMusicEq());

  useEffect(() => {
    setEq(getLocalMusicEq());
  }, []);

  const onEqChange = (key, value) => {
    const next = { ...eq, [key]: value };
    setEq(next);
    setLocalMusicEq({ [key]: value });
  };

  return (
    <div className="card p-4 space-y-4" data-testid="sound-control-station">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        <SlidersHorizontal size={14} /> Sound control station
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-2">
            <Volume2 size={14} /> Master volume
          </span>
          <span style={{ color: "var(--muted)" }}>{volume}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          disabled={disabled}
          onChange={(e) => onVolume(Number(e.target.value))}
          className="w-full"
          aria-label="Master volume"
        />
      </div>

      <div className="space-y-3 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs font-semibold">Equalizer</div>
        {EQ_BANDS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>{label}</span>
              <span style={{ color: "var(--muted)" }}>
                {hint} · {eq[key] > 0 ? "+" : ""}{eq[key]} dB
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={eq[key]}
              disabled={disabled}
              onChange={(e) => onEqChange(key, Number(e.target.value))}
              className="w-full"
              aria-label={`${label} equalizer`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
