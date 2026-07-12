"use client";

import { useEffect, useState } from "react";
import { Music, Pause, Play, SkipForward, Volume2 } from "lucide-react";
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

export default function CompactMusicPlayer() {
  const { settings, audio, updateSettings } = useCompanionContext();
  const [playing, setPlaying] = useState(false);
  const [localState, setLocalState] = useState({ playing: false, tracks: [], currentTrack: null });

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

  if (!settings) {
    return (
      <div className="card p-5 text-sm" style={{ color: "var(--muted)" }}>
        Loading music player…
      </div>
    );
  }

  const currentTrack = localState.currentTrack;
  const trackTitle = audio.ducked && audio.announcement
    ? "ZoomEats Alert"
    : useDeviceMusic && currentTrack
      ? currentTrack.name
      : isAmbient
        ? "ZoomEats Ambient"
        : "Companion Playlist";
  const trackArtist = useDeviceMusic
    ? `Device · ${localState.tracks.length} track${localState.tracks.length === 1 ? "" : "s"}`
    : settings.music_provider
      ? settings.music_provider.replace("_", " ")
      : "Built-in ambient audio";

  const onVolume = async (v) => {
    await updateSettings({ musicVolume: v });
    setBaseVolume(v, { ...prefs, musicVolume: v });
    if (useDeviceMusic) setLocalMusicVolume(v);
    else if (useSynth) setCompanionPlaybackVolume(v);
  };

  const onTogglePlay = () => {
    if (useDeviceMusic && !hasLocalTracks()) return;
    setPlaying((p) => !p);
  };

  const canPlay = !useDeviceMusic || hasLocalTracks();

  return (
    <div className="card p-4" data-testid="compact-music-player">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--muted)" }}>
        <Music size={14} /> ZoomEats Player
      </div>
      <div className="mb-3">
        <div className="font-bold truncate">{trackTitle}</div>
        <div className="text-xs capitalize truncate" style={{ color: "var(--muted)" }}>{trackArtist}</div>
        {isAmbient && !hasLocalTracks() && (
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Enable ZoomEats Ambient below and add tracks from your device to play music.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary !p-2 min-w-[44px] min-h-[44px]"
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
          onClick={() => skipLocalMusic(1)}
        >
          <SkipForward size={18} />
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Volume2 size={14} style={{ color: "var(--muted)" }} className="shrink-0" />
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
    </div>
  );
}
