"use client";

import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import CompanionAudioSync from "@/components/companion/CompanionAudioSync";
import DriverMiniPlayerDock from "@/components/companion/DriverMiniPlayerDock";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanionModeProvider>
      <CompanionAudioSync />
      {children}
      <DriverMiniPlayerDock />
    </CompanionModeProvider>
  );
}
