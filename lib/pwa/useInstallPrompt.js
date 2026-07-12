"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  clearInstallSnooze,
  getClientAppType,
  getDeviceId,
  getInstallDismissKey,
  getPwaConfig,
  isInstallSnoozed,
  isStandaloneMode,
  snoozeInstallPrompt,
} from "./appContext";

const PwaInstallContext = createContext(null);

export function PwaInstallProvider({ children }) {
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

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
    setIosHint(isIos && isSafari && !isStandaloneMode());

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

  const canInstall = !installed && (Boolean(deferredPrompt) || iosHint);
  const canAutoPrompt = canInstall && !snoozed;
  const config = getPwaConfig(appType);

  const install = useCallback(async () => {
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
  }, [appType, deferredPrompt, recordInstall]);

  const snooze = useCallback(() => {
    snoozeInstallPrompt(appType);
    setSnoozed(true);
    setManualOpen(false);
    recordInstall(appType, "dismissed").catch(() => {});
  }, [appType, recordInstall]);

  const openInstallPrompt = useCallback(() => {
    if (!canInstall) return;
    clearInstallSnooze(appType);
    setSnoozed(false);
    setManualOpen(true);
  }, [appType, canInstall]);

  const value = {
    appType,
    config,
    canInstall,
    canAutoPrompt,
    installed,
    iosHint,
    install,
    snooze,
    openInstallPrompt,
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
