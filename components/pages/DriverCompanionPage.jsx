"use client";

import Header from "@/components/Header";
import Link from "next/link";
import CompanionModePanel from "@/components/companion/CompanionModePanel";
import FloatingMusicPlayer from "@/components/companion/FloatingMusicPlayer";
import DriverSafetyMode from "@/components/companion/DriverSafetyMode";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";
import { useEffect, useState } from "react";
import { finishPendingMusicOAuth, parseMusicOAuthError } from "@/lib/companionMode/musicOAuth";

function DriverCompanionInner() {
  const { settings, confirmConnection, reload } = useCompanionContext();
  const [oauthMessage, setOauthMessage] = useState(null);
  const [oauthError, setOauthError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errMsg = parseMusicOAuthError(params);
    if (errMsg) {
      setOauthError(errMsg);
      sessionStorage.removeItem("companion_music_pending");
      window.history.replaceState({}, "", "/driver/companion");
      return;
    }

    const musicOauth = params.get("music_oauth");
    if (!musicOauth) return;

    (async () => {
      const ok = await finishPendingMusicOAuth(musicOauth);
      if (ok) {
        await confirmConnection(musicOauth);
        await reload();
        setOauthMessage(`${musicOauth === "youtube_music" ? "YouTube Music" : musicOauth} connected via Google.`);
        setOauthError(null);
      } else {
        setOauthError("Google sign-in did not return a music token. Try again or use ZoomEats Ambient.");
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
      {oauthError && (
        <div
          className="card p-4 mb-4 text-sm space-y-2"
          style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
        >
          <p className="font-bold">Google sign-in blocked</p>
          <p>{oauthError}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Admin: Google Cloud Console → OAuth consent screen → Test users → add your Gmail.
            Or use <strong>ZoomEats Ambient</strong> below (works now, no Google needed).
          </p>
        </div>
      )}
      {oauthMessage && (
        <div className="card p-3 mb-4 text-sm" style={{ color: "var(--primary)" }}>
          {oauthMessage}
        </div>
      )}
      <CompanionModePanel role="driver" />
      <FloatingMusicPlayer className="hidden md:block" />
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
        <DriverCompanionInner />
      </div>
    </div>
  );
}
