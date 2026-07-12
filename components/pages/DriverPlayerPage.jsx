"use client";

import Link from "next/link";
import CompactMusicPlayer from "@/components/companion/CompactMusicPlayer";
import DeviceMusicLibrary from "@/components/companion/DeviceMusicLibrary";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";

export default function DriverPlayerPage() {
  const { settings, connectAmbient, loading } = useCompanionContext();
  const isAmbient = settings?.music_connected && !settings?.music_provider;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4" data-testid="driver-player-page">
      <div>
        <h1 className="font-display text-2xl font-bold">ZoomEats Player</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Ambient music while you drive. Controls stay in this tab.
        </p>
      </div>

      <CompactMusicPlayer />

      {!isAmbient && !loading && (
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => connectAmbient()}
          data-testid="enable-ambient-player"
        >
          Enable ZoomEats Ambient
        </button>
      )}

      {isAmbient && <DeviceMusicLibrary />}

      <Link href="/driver/companion" className="btn-ghost w-full text-center text-sm block">
        Full companion settings →
      </Link>
    </div>
  );
}
