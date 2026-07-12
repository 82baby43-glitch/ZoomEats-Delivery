"use client";

import { Music, Pause, Play, Rewind, FastForward, SkipBack, SkipForward, Square } from "lucide-react";
import { useCompanionContext } from "./CompanionModeProvider";
import { hasLocalTracks } from "@/lib/companionMode/localMusic";
import { useMusicPlayback } from "@/lib/companionMode/useMusicPlayback";

export default function CompactMusicPlayer() {
  const { settings, audio, updateSettings } = useCompanionContext();
  const playback = useMusicPlayback({ settings, audio, updateSettings });
  const {
    localState,
    playing,
    canPlay,
    isAmbient,
    useDeviceMusic,
    onTogglePlay,
    onStop,
    onRewind,
    onFastForward,
    onSkipBack,
    onSkipForward,
  } = playback;

  const canSkipTracks = useDeviceMusic && localState.tracks.length >= 2;

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
            Enable ZoomEats Ambient below, or add tracks from your device to play music.
          </p>
        )}
      </div>
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[44px] min-h-[44px]"
          onClick={onSkipBack}
          disabled={!canSkipTracks}
          aria-label="Previous song"
        >
          <SkipBack size={18} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[44px] min-h-[44px]"
          onClick={onRewind}
          disabled={!useDeviceMusic}
          aria-label="Rewind 10 seconds"
        >
          <Rewind size={18} />
        </button>
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
          onClick={onStop}
          disabled={!playing}
          aria-label="Stop"
        >
          <Square size={16} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[44px] min-h-[44px]"
          onClick={onFastForward}
          disabled={!useDeviceMusic}
          aria-label="Fast forward 10 seconds"
        >
          <FastForward size={18} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[44px] min-h-[44px]"
          onClick={onSkipForward}
          disabled={!canSkipTracks}
          aria-label="Next song"
        >
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
}
