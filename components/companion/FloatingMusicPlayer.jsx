"use client";

import { useEffect, useState } from "react";
import { Music, Pause, Play, SkipForward, Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { useCompanionContext } from "./CompanionModeProvider";
import { setBaseVolume } from "@/lib/companionMode/audioDucking";
import {
  hasLocalTracks,
  pauseLocalMusic,
  playLocalMusic,
  setLocalMusicVolume,
  skipLocalMusic,
  subscribeLocalMusic,
} from "@/lib/companionMode/localMusic";
import {
  startCompanionPlayback,
  stopCompanionPlayback,
  setCompanionPlaybackVolume,
} from "@/lib/companionMode/playback";

export default function FloatingMusicPlayer({ className = "" }) {
  const { settings, audio, updateSettings, localMusic } = useCompanionContext();
  const [collapsed, setCollapsed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [localState, setLocalState] = useState(localMusic);

  const prefs = settings?.audio_preferences;
  const isAmbient = settings?.music_connected && !settings?.music_provider;
  const effectiveVolume = audio.ducked && prefs?.duckingEnabled
    ? (prefs.duckVolume ?? 20)
    : audio.volume;
  const useDeviceMusic = isAmbient && hasLocalTracks();
  const useSynth = settings?.music_connected && !isAmbient;

  useEffect(() => subscribeLocalMusic(setLocalState), []);

  useEffect(() => {
    setPlaying(localState.playing);
  }, [localState.playing]);

  useEffect(() => {
    if (!settings || !playing) {
      pauseLocalMusic();
      stopCompanionPlayback();
      return;
    }

    if (useDeviceMusic) {
      stopCompanionPlayback();
      setLocalMusicVolume(effectiveVolume);
      playLocalMusic().then((ok) => {
        if (!ok) setPlaying(false);
      });
      return () => pauseLocalMusic();
    }

    if (useSynth) {
      pauseLocalMusic();
      let cancelled = false;
      startCompanionPlayback(effectiveVolume).then((ok) => {
        if (!ok && !cancelled) setPlaying(false);
      });
      return () => {
        cancelled = true;
        stopCompanionPlayback();
      };
    }

    pauseLocalMusic();
    stopCompanionPlayback();
  }, [settings, playing, effectiveVolume, useDeviceMusic, useSynth]);

  useEffect(() => {
    if (!playing) return;
    if (useDeviceMusic) setLocalMusicVolume(effectiveVolume);
    else if (useSynth) setCompanionPlaybackVolume(effectiveVolume);
  }, [effectiveVolume, playing, useDeviceMusic, useSynth]);

  if (!settings) return null;

  const currentTrack = localState.currentTrack;
  const trackTitle = audio.ducked && audio.announcement
    ? "ZoomEats Alert"
    : useDeviceMusic && currentTrack
      ? currentTrack.name
      : isAmbient
        ? "Add music from your device"
        : "Companion Playlist";
  const trackArtist = useDeviceMusic
    ? `Device · ${localState.tracks.length} track${localState.tracks.length === 1 ? "" : "s"}`
    : settings.music_provider
      ? settings.music_provider.replace("_", " ")
      : "ZoomEats Ambient";

  const onVolume = async (v) => {
    await updateSettings({ musicVolume: v });
    setBaseVolume(v, { ...prefs, musicVolume: v });
    if (useDeviceMusic) setLocalMusicVolume(v);
    else if (useSynth) setCompanionPlaybackVolume(v);
  };

  const onTogglePlay = () => {
    if (useDeviceMusic && !hasLocalTracks()) {
      return;
    }
    setPlaying((p) => !p);
  };

  const onSkip = () => {
    if (useDeviceMusic) skipLocalMusic(1);
  };

  const canPlay = !useDeviceMusic || hasLocalTracks();

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
              {isAmbient && !hasLocalTracks() && (
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Add tracks in Device music above, then press play.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                className="btn-secondary !p-2 min-w-[44px] min-h-[44px]"
                onClick={onTogglePlay}
                disabled={!canPlay}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                type="button"
                className="btn-ghost !p-2 min-w-[44px] min-h-[44px]"
                aria-label="Skip"
                disabled={!useDeviceMusic || localState.tracks.length < 2}
                onClick={onSkip}
              >
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
