"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRealtimeRow } from "@/lib/useRealtime";

import { isExternalNavSessionActive } from "@/lib/logistics/externalNavSession";

const CACHE_PREFIX = "zoomeats_logistics_cache_";

/**
 * Targeted realtime refresh for logistics dashboards.
 * Uses filtered postgres_changes only — no duplicate broad subscriptions.
 */
export function useLogisticsRealtime({ role, restaurantId, driverId, onRefresh }) {
  const [paused, setPaused] = useState(false);
  const stableRefresh = useCallback(() => {
    if (!paused && typeof onRefresh === "function") onRefresh();
  }, [onRefresh, paused]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden && !isExternalNavSessionActive());
    document.addEventListener("visibilitychange", onVis);
    setPaused(document.hidden && !isExternalNavSessionActive());
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useRealtimeRow(
    "orders",
    "restaurant_id",
    role === "restaurant" ? restaurantId : null,
    stableRefresh
  );
  useRealtimeRow(
    "drivers",
    "driver_id",
    role === "driver" ? driverId : null,
    stableRefresh
  );
}

export function cacheLogisticsSnapshot(key: string, data: unknown) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

export function readLogisticsCache(key: string, maxAgeMs = 300000) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function useLogisticsPoll(fetchFn, cacheKey, intervalMs = 12000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pausedRef = useRef(false);

  const load = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const res = await fetchFn();
      const payload = res?.data ?? res;
      setData(payload);
      if (cacheKey) cacheLogisticsSnapshot(cacheKey, payload);
      setError(false);
    } catch (e) {
      console.warn("[logistics] load failed:", e);
      const cached = cacheKey ? readLogisticsCache(cacheKey) : null;
      if (cached) setData(cached);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, cacheKey]);

  useEffect(() => {
    const cached = cacheKey ? readLogisticsCache(cacheKey) : null;
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    load();
    const onVis = () => {
      pausedRef.current = document.hidden && !isExternalNavSessionActive();
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    pausedRef.current = document.hidden && !isExternalNavSessionActive();
    const t = setInterval(load, intervalMs);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, intervalMs, cacheKey]);

  return { data, loading, error, reload: load };
}
