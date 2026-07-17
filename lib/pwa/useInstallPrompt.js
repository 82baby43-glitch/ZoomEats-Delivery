"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  clearInstallSnooze,
  getClientAppType,
  getDeviceId,
  getPwaConfig,
  isInstallSnoozed,
  isIosSafari,
  isMobileDevice,
  isStandaloneMode,
  snoozeInstallPrompt,
} from "./appContext";
import { canUserAccessAppType } from "./roleAccess";

const PwaInstallContext = createContext(null);

export function PwaInstallProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [appType, setAppType] = useState("customer");
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const recordInstall = useCallback(async (type, status) => {
    try {
      await api.post("/pwa/installation", {
        app_type: type,
        installation_status: status,
        platform: /iphone|ipad|ipod|android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        device_id: getDeviceId(),
        user_agent: navigator.userAgent,
      });
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    const type = getClientAppType();
    setAppType(type);
    setInstalled(isStandaloneMode());
    setSnoozed(isInstallSnoozed(type));

    setIosHint(isIosSafari() && !isStandaloneMode());

    const onBip = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setManualOpen(false);
      recordInstall(type, "installed").catch(() => {});
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [recordInstall]);

  const roleAllowed = Boolean(user) && canUserAccessAppType(user, appType);
  const canNativeInstall = Boolean(deferredPrompt);
  const mobile = isMobileDevice();
  const canShowInstall = !authLoading && roleAllowed && !installed && (canNativeInstall || iosHint || mobile);
  const canInstall = canShowInstall;
  const canAutoPrompt = canShowInstall && !snoozed && (canNativeInstall || iosHint);
  const config = getPwaConfig(appType);

  const install = useCallback(async () => {
    if (!roleAllowed) return false;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice?.outcome === "accepted") {
        setInstalled(true);
        setManualOpen(false);
        await recordInstall(appType, "installed");
      }
      return choice?.outcome === "accepted";
    }
    return false;
  }, [appType, deferredPrompt, recordInstall, roleAllowed]);

  const snooze = useCallback(() => {
    snoozeInstallPrompt(appType);
    setSnoozed(true);
    setManualOpen(false);
    recordInstall(appType, "dismissed").catch(() => {});
  }, [appType, recordInstall]);

  const openInstallPrompt = useCallback(() => {
    if (!canShowInstall) return;
    clearInstallSnooze(appType);
    setSnoozed(false);
    setManualOpen(true);
  }, [appType, canShowInstall]);

  const value = {
    appType,
    config,
    canInstall,
    canShowInstall,
    canAutoPrompt,
    roleAllowed,
    installed,
    iosHint,
    install,
    snooze,
    openInstallPrompt,
    canNativeInstall,
    manualOpen,
    isStandalone: installed,
  };

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }
  return ctx;
}

/** @deprecated Use usePwaInstall */
export function useInstallPrompt() {
  return usePwaInstall();
}
