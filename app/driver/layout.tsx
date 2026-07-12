"use client";

import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import DriverMiniPlayerDock from "@/components/companion/DriverMiniPlayerDock";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanionModeProvider>
      {children}
      <DriverMiniPlayerDock />
    </CompanionModeProvider>
  );
}
