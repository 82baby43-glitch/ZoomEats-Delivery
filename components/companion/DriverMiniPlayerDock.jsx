"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Music } from "lucide-react";
import { useCompanionContext } from "@/components/companion/CompanionModeProvider";
import { hasLocalTracks } from "@/lib/companionMode/localMusic";

/** Slim ZoomEats Player bar above the mobile tab bar on driver routes. */
export default function DriverMiniPlayerDock() {
  const pathname = usePathname();
  const { settings } = useCompanionContext();

  const onDriverRoute =
    pathname.startsWith("/driver") ||
    pathname.startsWith("/delivery");

  if (!onDriverRoute || pathname.startsWith("/driver/login") || pathname === "/driver/player") {
    return null;
  }

  const isAmbient = settings?.music_connected && !settings?.music_provider;
  const subtitle = isAmbient
    ? hasLocalTracks()
      ? "Ambient ready — tap to play"
      : "Tap to enable & add music"
    : settings?.music_connected
      ? "Tap to open player"
      : "Tap to set up ZoomEats Ambient";

  return (
    <Link
      href="/driver/player"
      className="md:hidden fixed inset-x-0 z-40 border-t px-4 py-2.5 flex items-center gap-3"
      style={{
        bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
        background: "rgba(10,10,10,0.96)",
        borderColor: "var(--border)",
      }}
      data-testid="driver-mini-player-dock"
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "var(--primary)", color: "#0A0A0A" }}
      >
        <Music size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold truncate">ZoomEats Player</div>
        <div className="text-[10px] truncate" style={{ color: "var(--muted)" }}>{subtitle}</div>
      </div>
      <ChevronRight size={16} style={{ color: "var(--muted)" }} />
    </Link>
  );
}
