"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMobileDevice } from "@/lib/logistics/externalNavigation";
import type { ExternalNavProvider } from "@/lib/logistics/externalNavSession";
import {
  clearExternalNavSession,
  isExternalNavSessionActive,
  startExternalNavSession,
} from "@/lib/logistics/externalNavSession";

type OpenNavigationArgs = {
  provider: ExternalNavProvider;
  webUrl: string;
  nativeUrl?: string | null;
};

async function requestScreenWakeLock() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export function useExternalNavHandoff(orderId?: string | null) {
  const [handoffActive, setHandoffActive] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    setHandoffActive(isExternalNavSessionActive());
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      if (!isExternalNavSessionActive()) return;
      setHandoffActive(true);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    return () => {
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const openNavigation = useCallback(
    async ({ provider, webUrl, nativeUrl }: OpenNavigationArgs) => {
      startExternalNavSession({ orderId: orderId ?? undefined, provider });
      setHandoffActive(true);
      wakeLockRef.current = await requestScreenWakeLock();

      const useNative = isMobileDevice() && nativeUrl;
      if (useNative) {
        window.location.assign(nativeUrl);
      } else {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }
    },
    [orderId]
  );

  const dismissHandoff = useCallback(() => {
    clearExternalNavSession();
    setHandoffActive(false);
  }, []);

  return {
    handoffActive,
    returned: false,
    openNavigation,
    dismissHandoff,
    isMobile: isMobileDevice(),
  };
}
