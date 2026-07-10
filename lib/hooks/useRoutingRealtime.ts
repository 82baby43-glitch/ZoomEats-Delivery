"use client";

import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { routingChannelName } from "@/lib/dispatch/routing/realtime-push";
import { useRealtimeRow } from "@/lib/useRealtime";

/**
 * Subscribe to routing intelligence updates for a driver.
 * Combines Supabase broadcast (route.updated, eta.changed) + postgres_changes on driver_route_states.
 */
export function useRoutingRealtime(driverId, onUpdate) {
  const pausedRef = useRef(false);

  const stableOnUpdate = useCallback(
    (payload) => {
      if (pausedRef.current || typeof onUpdate !== "function") return;
      onUpdate(payload);
    },
    [onUpdate]
  );

  useEffect(() => {
    const onVis = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);
    pausedRef.current = document.hidden;
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useRealtimeRow("driver_route_states", "driver_id", driverId, (payload) => {
    stableOnUpdate({ source: "postgres", ...payload });
  });

  useEffect(() => {
    if (!supabase || !driverId) return;

    const channel = supabase
      .channel(routingChannelName(driverId))
      .on("broadcast", { event: "routing" }, (msg) => {
        stableOnUpdate({ source: "broadcast", payload: msg.payload });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, stableOnUpdate]);
}
