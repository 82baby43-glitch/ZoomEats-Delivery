"use client";

import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deliveryChannelName, type DeliveryRealtimeEvent } from "@/lib/logistics/delivery-realtime";

/**
 * Subscribe to delivery:{order_id} realtime broadcasts.
 * Events: driver_location_updated, driver_arrived, delivery_completed
 */
export function useDeliveryRealtime(orderId, onEvent) {
  const stableHandler = useCallback(
    (event: DeliveryRealtimeEvent, payload: Record<string, unknown>) => {
      if (typeof onEvent === "function") onEvent(event, payload);
    },
    [onEvent]
  );

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
