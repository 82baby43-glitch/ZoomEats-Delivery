"use client";

import { useEffect, useState } from "react";
import { Music, Pause, Play, SkipForward, Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { useCompanionContext } from "./CompanionModeProvider";
import { setBaseVolume } from "@/lib/companionMode/audioDucking";
import {
  startCompanionPlayback,
  stopCompanionPlayback,
  setCompanionPlaybackVolume,
} from "@/lib/companionMode/playback";

export default function FloatingMusicPlayer({ className = "" }) {
  const { settings, audio, updateSettings } = useCompanionContext();
  const [collapsed, setCollapsed] = useState(false);
  const [playing, setPlaying] = useState(true);

  const prefs = settings?.audio_preferences;
  const effectiveVolume = audio.volume;

  useEffect(() => {
    if (!settings || !playing) {
      stopCompanionPlayback();
      return;
    }
    let cancelled = false;
    startCompanionPlayback(effectiveVolume).then((ok) => {
      if (!ok && !cancelled) setPlaying(false);
    });
    return () => {
      cancelled = true;
      stopCompanionPlayback();
    };
  }, [settings, playing, effectiveVolume]);

  if (!settings) return null;

  const trackTitle = audio.ducked && audio.announcement ? "ZoomEats Alert" : "Companion Playlist";
  const trackArtist = settings.music_provider
    ? settings.music_provider.replace("_", " ")
    : "ZoomEats Ambient";

  const onVolume = async (v) => {
    await updateSettings({ musicVolume: v });
    setBaseVolume(v, { ...prefs, musicVolume: v });
    setCompanionPlaybackVolume(v);
  };

  return (
    <div
      className={`fixed z-40 left-4 right-4 md:left-auto md:right-6 md:w-80 bottom-24 md:bottom-6 pointer-events-auto ${className}`}
      data-testid="floating-music-player"
      style={{ maxWidth: "calc(100vw - 2rem)" }}
    >
      <div className="card p-3 shadow-lg border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            <Music size={14} /> {collapsed ? "Music" : "Currently Playing"}
          </div>
          <button type="button" className="btn-ghost !p-1" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle player">
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {!collapsed && (
          <>
            <div className="mb-3">
              <div className="font-bold text-sm truncate">{trackTitle}</div>
              <div className="text-xs capitalize truncate" style={{ color: "var(--muted)" }}>{trackArtist}</div>
              {audio.ducked && (
                <div className="text-xs mt-1" style={{ color: "var(--primary)" }}>Volume lowered for alert</div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                className="btn-secondary !p-2 min-w-[44px] min-h-[44px]"
                onClick={() => setPlaying(!playing)}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button type="button" className="btn-ghost !p-2 min-w-[44px] min-h-[44px]" aria-label="Skip">
                <SkipForward size={18} />
              </button>
              <div className="flex-1 flex items-center gap-2">
                <Volume2 size={14} style={{ color: "var(--muted)" }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audio.volume}
                  onChange={(e) => onVolume(Number(e.target.value))}
                  className="w-full"
                  aria-label="Volume"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
