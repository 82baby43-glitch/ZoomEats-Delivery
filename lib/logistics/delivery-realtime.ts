export type DeliveryRealtimeEvent =
  | "driver_location_updated"
  | "driver_arrived"
  | "delivery_completed";

export type DriverLocationBroadcast = {
  event: DeliveryRealtimeEvent;
  order_id: string;
  driver_id: string;
  latitude?: number;
  longitude?: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  battery_level?: number | null;
  status?: string;
  ts: string;
};

export const DELIVERY_CHANNEL_PREFIX = "delivery";

export function deliveryChannelName(orderId: string): string {
  return `${DELIVERY_CHANNEL_PREFIX}:${orderId}`;
}

export type RealtimeRuntime = {
  supabaseUrl?: string;
  serviceKey?: string;
};

function resolveRealtimeCredentials(runtime?: RealtimeRuntime) {
  const supabaseUrl = runtime?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = runtime?.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { supabaseUrl, serviceKey };
}

/** Server-side: broadcast delivery channel event via Supabase Realtime REST. */
export async function pushDeliveryEvent(
  orderId: string,
  event: DeliveryRealtimeEvent,
  payload: Omit<DriverLocationBroadcast, "event" | "order_id" | "ts">,
  runtime?: RealtimeRuntime
): Promise<void> {
  const { supabaseUrl, serviceKey } = resolveRealtimeCredentials(runtime);
  if (!supabaseUrl || !serviceKey) return;

  const message: DriverLocationBroadcast = {
    event,
    order_id: orderId,
    ts: new Date().toISOString(),
    ...payload,
  };

  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: deliveryChannelName(orderId),
            event,
            payload: message,
          },
        ],
      }),
    });
  } catch (e) {
    console.warn(JSON.stringify({ delivery_broadcast_failed: String(e), order_id: orderId, event }));
  }
}
