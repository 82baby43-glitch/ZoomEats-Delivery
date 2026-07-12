"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  getClientAppType,
  getDeviceId,
  getInstallDismissKey,
  getPwaConfig,
  isStandaloneMode,
} from "./appContext";

export function useInstallPrompt() {
  const [appType, setAppType] = useState("customer");
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const type = getClientAppType();
    setAppType(type);
    setInstalled(isStandaloneMode());
    setDismissed(localStorage.getItem(getInstallDismissKey(type)) === "1");

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
      recordInstall(type, "installed").catch(() => {});
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

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
      // Non-blocking — user may not be logged in yet
    }
  }, []);

  const canPrompt = !installed && !dismissed && (Boolean(deferredPrompt) || iosHint);
  const config = getPwaConfig(appType);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice?.outcome === "accepted") {
        setInstalled(true);
        await recordInstall(appType, "installed");
      }
      return choice?.outcome === "accepted";
    }
    return false;
  }, [appType, deferredPrompt, recordInstall]);

  const dismiss = useCallback(() => {
    localStorage.setItem(getInstallDismissKey(appType), "1");
    setDismissed(true);
    recordInstall(appType, "dismissed").catch(() => {});
  }, [appType, recordInstall]);

  return {
    appType,
    config,
    canPrompt,
    installed,
    iosHint,
    install,
    dismiss,
    isStandalone: installed,
  };
}
