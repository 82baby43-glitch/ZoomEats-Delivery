"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebPush } from "@/lib/useWebPush";
import { isMobileDevice } from "@/lib/logistics/externalNavigation";
import type { ExternalNavProvider } from "@/lib/logistics/externalNavSession";
import {
  clearExternalNavSession,
  getExternalNavSession,
  isExternalNavSessionActive,
  startExternalNavSession,
} from "@/lib/logistics/externalNavSession";

const RETURN_PING_MS = 2500;
const RETURN_PING_TAG = "zoomeats-external-nav-return";

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
  const { request, fire } = useWebPush("ZoomEats");
  const [handoffActive, setHandoffActive] = useState(false);
  const [returned, setReturned] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingCountRef = useRef(0);

  useEffect(() => {
    setHandoffActive(isExternalNavSessionActive());
  }, []);

  const scheduleReturnPing = useCallback(() => {
    if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
    if (pingCountRef.current >= 3) return;
    pingTimerRef.current = setTimeout(() => {
      if (!document.hidden || !isExternalNavSessionActive()) return;
      const session = getExternalNavSession();
      fire(
        "ZoomEats delivery active",
        "Tap to return — your location is still shared with the customer.",
        {
          tag: RETURN_PING_TAG,
          onClick: () => {
            window.focus();
            setReturned(true);
          },
        }
      );
      pingCountRef.current += 1;
      if (session?.orderId === orderId && pingCountRef.current < 3) {
        pingTimerRef.current = setTimeout(scheduleReturnPing, 45_000);
      }
    }, RETURN_PING_MS);
  }, [fire, orderId]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      if (!isExternalNavSessionActive()) return;
      setHandoffActive(true);
      setReturned(true);
      if (pingTimerRef.current) {
        clearTimeout(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    return () => {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const openNavigation = useCallback(
    async ({ provider, webUrl, nativeUrl }: OpenNavigationArgs) => {
      startExternalNavSession({ orderId: orderId ?? undefined, provider });
      setHandoffActive(true);
      setReturned(false);
      pingCountRef.current = 0;

      await request();
      wakeLockRef.current = await requestScreenWakeLock();

      const useNative = isMobileDevice() && nativeUrl;
      if (useNative) {
        window.location.assign(nativeUrl);
      } else {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }

      scheduleReturnPing();
    },
    [orderId, request, scheduleReturnPing]
  );

  const dismissHandoff = useCallback(() => {
    clearExternalNavSession();
    setHandoffActive(false);
    setReturned(false);
    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  return {
    handoffActive,
    returned,
    openNavigation,
    dismissHandoff,
    isMobile: isMobileDevice(),
  };
}
