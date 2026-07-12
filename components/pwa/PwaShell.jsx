"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { detectAppTypeFromPath, getClientAppType, persistClientAppType } from "@/lib/pwa/appContext";
import AppSplash from "@/components/pwa/AppSplash";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import MobileTabBar from "@/components/navigation/MobileTabBar";

export default function PwaShell() {
  const pathname = usePathname();

  useEffect(() => {
    const fromPath = detectAppTypeFromPath(pathname);
    const type = fromPath !== "customer" ? fromPath : getClientAppType();
    persistClientAppType(type);
  }, [pathname]);

  return (
    <>
      <AppSplash />
      <InstallPrompt />
      <MobileTabBar />
    </>
  );
}
