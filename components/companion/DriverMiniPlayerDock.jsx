"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FastForward, Music, Pause, Play, Rewind, RotateCcw, SkipBack, SkipForward, Square } from "lucide-react";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";
import { hasLocalTracks } from "@/lib/companionMode/localMusic";
import { useMusicPlayback } from "@/lib/companionMode/useMusicPlayback";

/** Slim ZoomEats Player bar above the mobile tab bar on driver routes. */
export default function DriverMiniPlayerDock() {
  const pathname = usePathname();
  const { settings, audio, updateSettings } = useCompanionContext();
  const playback = useMusicPlayback({ settings, audio, updateSettings });
  const { localState, playing, canPlay, isAmbient, useDeviceMusic, onTogglePlay, onStop, onRewind, onRestart, onFastForward, onSkipBack, onSkipForward } =
    playback;

  const canSkipTracks = useDeviceMusic && localState.tracks.length >= 2;

  const onDriverRoute =
    pathname.startsWith("/driver") ||
    pathname.startsWith("/delivery");

  if (!onDriverRoute || pathname.startsWith("/driver/login") || pathname === "/driver/player") {
    return null;
  }

  const trackName =
    useDeviceMusic && localState.currentTrack
      ? localState.currentTrack.name
      : isAmbient
        ? "ZoomEats Ambient"
        : "ZoomEats Player";

  const subtitle = playing
    ? "Now playing"
    : isAmbient
      ? hasLocalTracks()
        ? "Tap title for full player"
        : "Add music in Player tab"
      : settings?.music_connected
        ? "Tap title for player"
        : "Set up in Player tab";

  return (
    <div
      className="md:hidden fixed inset-x-0 z-40 border-t px-3 py-2"
      style={{
        bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
        background: "rgba(10,10,10,0.96)",
        borderColor: "var(--border)",
      }}
      data-testid="driver-mini-player-dock"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[40px] min-h-[40px] shrink-0"
          onClick={onSkipBack}
          disabled={!canSkipTracks}
          aria-label="Previous track"
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[40px] min-h-[40px] shrink-0"
          onClick={onRewind}
          disabled={!useDeviceMusic}
          aria-label="Rewind 10 seconds"
        >
          <Rewind size={16} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[40px] min-h-[40px] shrink-0"
          onClick={onRestart}
          disabled={!useDeviceMusic}
          aria-label="Start from beginning"
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          className="!p-2 min-w-[40px] min-h-[40px] shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: "var(--primary)", color: "#0A0A0A" }}
          onClick={onTogglePlay}
          disabled={!canPlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[40px] min-h-[40px] shrink-0"
          onClick={onStop}
          disabled={!playing}
          aria-label="Stop"
        >
          <Square size={14} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[40px] min-h-[40px] shrink-0"
          onClick={onFastForward}
          disabled={!useDeviceMusic}
          aria-label="Fast forward 10 seconds"
        >
          <FastForward size={16} />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 min-w-[40px] min-h-[40px] shrink-0"
          onClick={onSkipForward}
          disabled={!canSkipTracks}
          aria-label="Next track"
        >
          <SkipForward size={16} />
        </button>

        <Link href="/driver/player" className="flex-1 min-w-0 flex items-center gap-2 ml-1">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hidden xs:flex"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <Music size={14} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate">{trackName}</div>
            <div className="text-[10px] truncate" style={{ color: "var(--muted)" }}>{subtitle}</div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--muted)" }} className="shrink-0" />
        </Link>
      </div>
    </div>
  );
}
