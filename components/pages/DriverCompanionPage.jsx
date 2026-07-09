"use client";

import Header from "@/components/Header";
import Link from "next/link";
import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import CompanionModePanel from "@/components/companion/CompanionModePanel";
import FloatingMusicPlayer from "@/components/companion/FloatingMusicPlayer";
import DriverSafetyMode from "@/components/companion/DriverSafetyMode";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";
import { useEffect } from "react";
import { useCompanionMode } from "@/lib/hooks/useCompanionMode";

function DriverCompanionInner() {
  const { settings, confirmConnection } = useCompanionContext();
  const companion = useCompanionMode();

  useEffect(() => {
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "companion_oauth" && e.data.provider) {
        await confirmConnection(e.data.provider);
        companion.reload();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [confirmConnection, companion]);

  return (
    <>
      <DriverSafetyMode
        enabled={!!settings?.audio_preferences?.safetyMode}
        onAcceptOrder={() => {}}
        onStartNavigation={() => window.open("https://maps.google.com", "_blank")}
        onArrivedRestaurant={() => {}}
        onDelivered={() => {}}
      />
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
