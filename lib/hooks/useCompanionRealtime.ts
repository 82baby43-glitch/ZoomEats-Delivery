"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { triggerAudioDucking } from "@/lib/companionMode/audioDucking";
import type { AudioPreferences, CompanionEventType } from "@/lib/companionMode/types";

const HIGH_PRIORITY: CompanionEventType[] = [
  "delivery_created",
  "delivery_assigned",
  "customer_message",
  "restaurant_message",
  "navigation_event",
  "safety_alert",
];

function duckForEvent(
  type: CompanionEventType,
  message: string,
  orderId?: string,
  prefs?: AudioPreferences
) {
  triggerAudioDucking(
    {
      type,
      priority: HIGH_PRIORITY.includes(type) ? "high" : "medium",
      message,
      order_id: orderId,
    },
    prefs
  );
}

interface Options {
  role: "driver" | "restaurant";
  userId?: string;
  driverId?: string;
  restaurantId?: string;
  enabled?: boolean;
  audioPreferences?: AudioPreferences | null;
  onRefresh?: () => void;
}

/** Listen for delivery/order events and trigger companion audio ducking without touching dispatch. */
export function useCompanionRealtime({
  role,
  userId,
  driverId,
  restaurantId,
  enabled = true,
  audioPreferences,
  onRefresh,
}: Options) {
  const prefsRef = useRef(audioPreferences);

  useEffect(() => {
    prefsRef.current = audioPreferences;
  }, [audioPreferences]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    if (role === "driver") {
      const ordersChannel = supabase
        .channel(`companion-driver-orders-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: "status=eq.ready" },
          (payload) => {
            const row = payload.new as { order_id?: string; restaurant_name?: string };
            duckForEvent(
              "delivery_created",
              "You have a new delivery request",
              row.order_id,
              prefsRef.current || undefined
            );
            onRefresh?.();
          }
        )
        .subscribe();
      channels.push(ordersChannel);
    }

    if (role === "restaurant" && restaurantId) {
      const restOrders = supabase
        .channel(`companion-rest-orders-${restaurantId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "orders",
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          (payload) => {
            const row = payload.new as { order_id?: string; customer_name?: string; payment_status?: string };
            if (row.payment_status !== "paid") return;
            duckForEvent(
              "delivery_assigned",
              `New order from ${row.customer_name || "customer"}`,
              row.order_id,
              prefsRef.current || undefined
            );
            onRefresh?.();
          }
        )
        .subscribe();
      channels.push(restOrders);
    }

    const companionChannel = supabase
      .channel(`companion-events-${userId}`)
      .on("broadcast", { event: "companion_duck" }, ({ payload }) => {
        const p = payload as { event_type?: CompanionEventType; message?: string; order_id?: string };
        if (p.event_type && p.message) {
          duckForEvent(p.event_type, p.message, p.order_id, prefsRef.current || undefined);
        }
      })
      .subscribe();
    channels.push(companionChannel);

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [enabled, userId, role, restaurantId, driverId, onRefresh]);
}
