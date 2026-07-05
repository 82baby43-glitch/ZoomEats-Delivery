import type { RoutingBroadcastPayload, RoutingEventType } from "./types.ts";

export const ROUTING_CHANNEL_PREFIX = "routing";

export function routingChannelName(driverId: string): string {
  return `${ROUTING_CHANNEL_PREFIX}:${driverId}`;
}

export function buildBroadcastPayload(
  event: RoutingEventType,
  driverId: string,
  data: Partial<RoutingBroadcastPayload> = {}
): RoutingBroadcastPayload {
  return {
    event,
    driver_id: driverId,
    ts: new Date().toISOString(),
    ...data,
  };
}

/** Client-side: subscribe to routing broadcast events for a driver. */
export function subscribeRoutingChannel(
  supabase: { channel: (name: string) => { on: (type: string, filter: object, cb: (p: { payload: RoutingBroadcastPayload }) => void) => { subscribe: () => void }; subscribe: (cb?: (s: string) => void) => void } },
  driverId: string,
  onEvent: (payload: RoutingBroadcastPayload) => void
) {
  const channel = supabase
    .channel(routingChannelName(driverId))
    .on("broadcast", { event: "routing" }, (msg: { payload: RoutingBroadcastPayload }) => {
      onEvent(msg.payload);
    })
    .subscribe();
  return channel;
}

/** Server-side: broadcast routing update via Supabase Realtime REST (edge). */
export async function pushRoutingUpdate(
  supabaseUrl: string,
  serviceKey: string,
  payload: RoutingBroadcastPayload
): Promise<void> {
  try {
    const channel = routingChannelName(payload.driver_id);
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
            topic: channel,
            event: "routing",
            payload,
          },
        ],
      }),
    });
  } catch (e) {
    console.warn(JSON.stringify({ routing_broadcast_failed: String(e), driver_id: payload.driver_id }));
  }
}
