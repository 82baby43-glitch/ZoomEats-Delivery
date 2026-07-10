"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { trackingIntervalMs, resolveTrackingMode } from "@/lib/logistics/driver-location-service";

type Coords = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
};

type Options = {
  enabled: boolean;
  activeOrderId?: string | null;
  activeOrderStatus?: string | null;
};

async function readBatteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number }>;
    };
    if (!nav.getBattery) return null;
    const battery = await nav.getBattery();
    return Math.round(battery.level * 1000) / 1000;
  } catch {
    return null;
  }
}

function useGeolocationCoords(active: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
        });
        setError(null);
      },
      (e) => setError(e.message || "Location unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return { coords, error };
}

/**
 * Adaptive GPS heartbeat:
 * - offline (enabled=false): no posts
 * - online: every 30–60s
 * - active delivery: every 5–10s
 */
export function useDriverGpsTracking({ enabled, activeOrderId, activeOrderStatus }: Options) {
  const { coords, error } = useGeolocationCoords(enabled);
  const coordsRef = useRef<Coords | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled) return;

    const mode = resolveTrackingMode(
      true,
      activeOrderStatus ?? (activeOrderId ? "assigned_internal" : null)
    );

    const send = async () => {
      const current = coordsRef.current;
      if (!current || sendingRef.current) return;
      sendingRef.current = true;
      try {
        const battery = await readBatteryLevel();
        await api.post("/driver/location", {
          latitude: current.lat,
          longitude: current.lng,
          heading: current.heading ?? undefined,
          speed: current.speed ?? undefined,
          accuracy: current.accuracy ?? undefined,
          battery_level: battery ?? undefined,
          order_id: activeOrderId ?? undefined,
        });
      } catch (e) {
        console.warn("[gps-tracking] location post failed:", e);
      } finally {
        sendingRef.current = false;
      }
    };

    const schedule = () => {
      const delay = trackingIntervalMs(mode) ?? 45_000;
      timerRef.current = setTimeout(async () => {
        await send();
        schedule();
      }, delay);
    };

    if (coordsRef.current) send();
    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, activeOrderId, activeOrderStatus]);

  return { coords, geoError: error };
}
