"use client";

import Header from "@/components/Header";
import Link from "next/link";
import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import CompanionModePanel from "@/components/companion/CompanionModePanel";
import FloatingMusicPlayer from "@/components/companion/FloatingMusicPlayer";
import DriverSafetyMode from "@/components/companion/DriverSafetyMode";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";
import { useEffect, useState } from "react";
import { finishPendingMusicOAuth } from "@/lib/companionMode/musicOAuth";

function DriverCompanionInner() {
  const { settings, confirmConnection, reload } = useCompanionContext();
  const [oauthMessage, setOauthMessage] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("music_oauth") !== "youtube_music") return;

    (async () => {
      const ok = await finishPendingMusicOAuth("youtube_music");
      if (ok) {
        await confirmConnection("youtube_music");
        await reload();
        setOauthMessage("YouTube Music connected via Google.");
      } else {
        setOauthMessage("Google sign-in did not return a music token. Try again and allow YouTube access.");
      }
      window.history.replaceState({}, "", "/driver/companion");
    })();
  }, [confirmConnection, reload]);

  useEffect(() => {
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "companion_oauth" && e.data.provider) {
        await confirmConnection(e.data.provider);
        reload();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [confirmConnection, reload]);

  return (
    <>
      <DriverSafetyMode
        enabled={!!settings?.audio_preferences?.safetyMode}
        onAcceptOrder={() => {}}
        onStartNavigation={() => window.open("https://maps.google.com", "_blank")}
        onArrivedRestaurant={() => {}}
        onDelivered={() => {}}
      />
      {oauthMessage && (
        <div className="card p-3 mb-4 text-sm" style={{ color: "var(--primary)" }}>
          {oauthMessage}
        </div>
      )}
      <CompanionModePanel role="driver" />
      <FloatingMusicPlayer />
    </>
  );
}

export default function DriverCompanionPage() {
  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Companion Mode™</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Music, ducking, and safety tools for drivers.
            </p>
          </div>
          <Link href="/driver/dashboard" className="btn-ghost text-sm">← Driver dashboard</Link>
        </div>
        <CompanionModeProvider>
          <DriverCompanionInner />
        </CompanionModeProvider>
      </div>
    </div>
  );
}
