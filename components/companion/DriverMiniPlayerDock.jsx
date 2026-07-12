"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FastForward, Music, Pause, Play, Rewind, RotateCcw, Square } from "lucide-react";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";
import { hasLocalTracks } from "@/lib/companionMode/localMusic";
import { useMusicPlayback } from "@/lib/companionMode/useMusicPlayback";

const TAB_WIDTH_PX = 44;

/** Collapsible side dock — slim tab on the right; tap to slide controls out to the left. */
export default function DriverMiniPlayerDock() {
  const pathname = usePathname();
  const { settings, audio, updateSettings } = useCompanionContext();
  const playback = useMusicPlayback({ settings, audio, updateSettings });
  const [open, setOpen] = useState(false);
  const {
    localState,
    playing,
    canPlay,
    isAmbient,
    useDeviceMusic,
    onTogglePlay,
    onStop,
    onRewind,
    onRestart,
    onFastForward,
  } = playback;

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
        ? "Tap for full player"
        : "Add music in Player tab"
      : settings?.music_connected
        ? "Tap for player"
        : "Set up in Player tab";

  return (
    <div
      className="md:hidden fixed right-0 z-40 flex items-center pointer-events-none"
      style={{ top: "50%", transform: "translateY(-50%)" }}
      data-testid="driver-mini-player-dock"
    >
      <div
        className="flex items-stretch pointer-events-auto transition-transform duration-300 ease-out"
        style={{
          transform: open ? "translateX(0)" : `translateX(calc(100% - ${TAB_WIDTH_PX}px))`,
        }}
      >
        <div
          className="border border-r-0 rounded-l-2xl shadow-xl overflow-hidden"
          style={{
            background: "rgba(10,10,10,0.97)",
            borderColor: "var(--border)",
          }}
        >
          <div className="px-3 py-3 flex flex-col gap-2.5 w-[min(72vw,240px)]">
            <Link
              href="/driver/player"
              onClick={() => setOpen(false)}
              className="min-w-0 block rounded-lg px-2 py-1.5 -mx-1 hover:bg-white/5 transition-colors"
            >
              <div className="text-xs font-bold truncate">{trackName}</div>
              <div className="text-[10px] truncate" style={{ color: "var(--muted)" }}>{subtitle}</div>
            </Link>

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                className="btn-ghost !p-2 min-w-[40px] min-h-[40px]"
                onClick={onRewind}
                disabled={!useDeviceMusic}
                aria-label="Rewind 10 seconds"
              >
                <Rewind size={16} />
              </button>
              <button
                type="button"
                className="btn-ghost !p-2 min-w-[40px] min-h-[40px]"
                onClick={onRestart}
                disabled={!useDeviceMusic}
                aria-label="Start from beginning"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                className="!p-2 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--primary)", color: "#0A0A0A" }}
                onClick={onTogglePlay}
                disabled={!canPlay}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                type="button"
                className="btn-ghost !p-2 min-w-[40px] min-h-[40px]"
                onClick={onStop}
                disabled={!playing}
                aria-label="Stop"
              >
                <Square size={14} />
              </button>
              <button
                type="button"
                className="btn-ghost !p-2 min-w-[40px] min-h-[40px]"
                onClick={onFastForward}
                disabled={!useDeviceMusic}
                aria-label="Fast forward 10 seconds"
              >
                <FastForward size={16} />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-col items-center justify-center gap-1.5 shrink-0 border border-r-0 rounded-l-xl shadow-lg"
          style={{
            width: TAB_WIDTH_PX,
            minHeight: 96,
            background: playing ? "var(--primary)" : "rgba(10,10,10,0.97)",
            color: playing ? "#0A0A0A" : "var(--primary)",
            borderColor: "var(--border)",
          }}
          aria-label={open ? "Hide ZoomEats player" : "Show ZoomEats player"}
          aria-expanded={open}
          data-testid="driver-mini-player-tab"
        >
          <Music size={18} className={playing ? "" : "opacity-90"} />
          <span
            className="text-[9px] font-bold uppercase tracking-widest leading-none"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            ZE
          </span>
        </button>
      </div>
    </div>
  );
}
