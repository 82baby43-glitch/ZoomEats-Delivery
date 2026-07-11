"use client";

import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export function driverOfferChannelName(driverId) {
  return `driver-offers:${driverId}`;
}

export function useDriverOfferRealtime(driverId, onOffer) {
  const handlerRef = useRef(onOffer);

  useEffect(() => {
    handlerRef.current = onOffer;
  }, [onOffer]);

  const stableHandler = useCallback((payload) => {
    if (typeof handlerRef.current === "function") handlerRef.current(payload);
  }, []);

  useEffect(() => {
    if (!supabase || !driverId) return;

    const channel = supabase
      .channel(driverOfferChannelName(driverId))
      .on("broadcast", { event: "new_order_offer" }, (msg) => {
        stableHandler(msg.payload ?? {});
      })
      .on("broadcast", { event: "offer_accepted" }, (msg) => {
        stableHandler({ ...msg.payload, event: "offer_accepted" });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, stableHandler]);
}
