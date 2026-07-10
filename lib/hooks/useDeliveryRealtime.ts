"use client";

import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deliveryChannelName, type DeliveryRealtimeEvent } from "@/lib/logistics/delivery-realtime";

/**
 * Subscribe to delivery:{order_id} realtime broadcasts.
 * Events: driver_location_updated, driver_arrived, delivery_completed
 */
export function useDeliveryRealtime(orderId, onEvent) {
  const pausedRef = useRef(false);

  const stableHandler = useCallback(
    (event: DeliveryRealtimeEvent, payload: Record<string, unknown>) => {
      if (pausedRef.current || typeof onEvent !== "function") return;
      onEvent(event, payload);
    },
    [onEvent]
  );

  useEffect(() => {
    const onVis = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);
    pausedRef.current = document.hidden;
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!supabase || !orderId) return;

    const channel = supabase
      .channel(deliveryChannelName(orderId))
      .on("broadcast", { event: "driver_location_updated" }, (msg) => {
        stableHandler("driver_location_updated", msg.payload ?? {});
      })
      .on("broadcast", { event: "driver_arrived" }, (msg) => {
        stableHandler("driver_arrived", msg.payload ?? {});
      })
      .on("broadcast", { event: "delivery_completed" }, (msg) => {
        stableHandler("delivery_completed", msg.payload ?? {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, stableHandler]);
}
