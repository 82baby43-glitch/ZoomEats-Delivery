"use client";

import { useEffect } from "react";
import { getClientAppType, persistClientAppType } from "@/lib/pwa/appContext";
import AppSplash from "@/components/pwa/AppSplash";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import MobileTabBar from "@/components/navigation/MobileTabBar";

export default function PwaShell() {
  useEffect(() => {
    persistClientAppType(getClientAppType());
  }, []);

  return (
    <>
      <AppSplash />
      <InstallPrompt />
      <MobileTabBar />
    </>
  );
}
