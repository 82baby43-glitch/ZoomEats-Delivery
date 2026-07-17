"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  getPwaConfig,
  persistClientAppType,
  resolveAppType,
} from "@/lib/pwa/appContext";
import AppSplash from "@/components/pwa/AppSplash";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import RoleRouter from "@/components/auth/RoleRouter";
import MobileTabBar from "@/components/navigation/MobileTabBar";

export default function PwaShell() {
  const pathname = usePathname();

  useEffect(() => {
    const type = resolveAppType(window.location.host, pathname);
    persistClientAppType(type);
    const cfg = getPwaConfig(type);
    document.title = cfg.name;
  }, [pathname]);

  return (
    <>
      <RoleRouter />
      <AppSplash />
      <InstallPrompt />
      <MobileTabBar />
    </>
  );
}
