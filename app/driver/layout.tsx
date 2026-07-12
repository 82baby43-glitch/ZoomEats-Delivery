"use client";

import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <CompanionModeProvider>{children}</CompanionModeProvider>;
}
