import type { SupabaseClient } from "@supabase/supabase-js";
import { metersBetween } from "../dispatch/routing/geo";
import { pushDeliveryEvent, type RealtimeRuntime } from "../logistics/delivery-realtime";
import {
  customerFirstName,
  formatDisplayOrderNumber,
  pickupVerbalScript,
} from "./displayOrder";

export type DeliveryMethod = "leave_at_door" | "hand_to_me";

export const GPS_ARRIVAL_RADIUS_METERS = 100;
export const HIGH_VALUE_PIN_THRESHOLD = 75;
export const MAX_PIN_ATTEMPTS = 5;

const PIN_SALT = process.env.DELIVERY_PIN_SALT || "zoomeats-delivery-pin-v1";

export function generateDeliveryPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashDeliveryPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${pin}:${PIN_SALT}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyDeliveryPinHash(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  const computed = await hashDeliveryPin(pin);
  return computed === hash;
}

export function shouldRequireDeliveryPin(order: {
  delivery_method?: string | null;
  require_delivery_pin?: boolean | null;
  total?: number | null;
}): boolean {
  if (order.delivery_method === "leave_at_door") return false;
  if (order.require_delivery_pin) return true;
  return Number(order.total || 0) >= HIGH_VALUE_PIN_THRESHOLD;
}

export function isWithinGpsRadius(
  driverLat: number,
  driverLng: number,
  targetLat: number,
  targetLng: number,
  radiusMeters = GPS_ARRIVAL_RADIUS_METERS
): boolean {
  if (!Number.isFinite(driverLat) || !Number.isFinite(driverLng)) return false;
  if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return false;
  return metersBetween({ lat: driverLat, lng: driverLng }, { lat: targetLat, lng: targetLng }) <= radiusMeters;
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function recordDeliveryEvent(
  db: SupabaseClient,
  orderId: string,
  eventType: string,
  opts: {
    actorRole?: string;
    actorId?: string;
    message?: string;
    meta?: Record<string, unknown>;
    latitude?: number;
    longitude?: number;
  } = {}
) {
  await db.from("delivery_events").insert({
    event_id: uid("dev"),
    order_id: orderId,
    event_type: eventType,
    actor_role: opts.actorRole,
    actor_id: opts.actorId,
    message: opts.message,
    meta: opts.meta || {},
    latitude: opts.latitude,
    longitude: opts.longitude,
    created_at: new Date().toISOString(),
  });
}

export async function notifyDeliveryMilestone(
  orderId: string,
  eventType: string,
  payload: Record<string, unknown>,
  runtime?: RealtimeRuntime
) {
  try {
    await pushDeliveryEvent(orderId, "delivery_milestone", { ...payload, milestone: eventType }, runtime);
  } catch (e) {
    console.warn(JSON.stringify({ delivery_milestone_broadcast_skipped: String(e), orderId, eventType }));
  }
}

export const CUSTOMER_MILESTONE_MESSAGES: Record<string, string> = {
  driver_assigned: "Your driver is heading to the restaurant.",
  arrived_at_store: "Your driver has arrived at the restaurant.",
  order_ready: "Your order has been prepared and is ready for pickup.",
  picked_up: "Your driver is on the way with your order.",
  arrived_at_customer: "Your driver has arrived.",
  delivered: "Your order has been delivered.",
  photo_uploaded: "Delivery photo confirmed.",
  pin_verified: "Delivery verified.",
  pickup_confirmed: "Driver confirmed the correct order at pickup.",
};

export function driverVisibleDeliveryPrefs(order: Record<string, unknown>) {
  const orderId = String(order.order_id || "");
  return {
    delivery_method: order.delivery_method || "hand_to_me",
    delivery_instructions: order.delivery_instructions || order.notes || "",
    require_delivery_pin: Boolean(order.require_delivery_pin),
    allow_photo_confirmation: order.allow_photo_confirmation !== false,
    pin_required: shouldRequireDeliveryPin(order as { delivery_method?: string; require_delivery_pin?: boolean; total?: number }),
    restaurant_ready: Boolean(order.restaurant_ready_at),
    display_order_number: formatDisplayOrderNumber(orderId),
    customer_first_name: customerFirstName(order.customer_name as string | undefined),
    pickup_verbal_script: pickupVerbalScript(orderId, order.customer_name as string | undefined),
    item_count: Array.isArray(order.items) ? order.items.length : null,
    restaurant_name: order.restaurant_name || null,
  };
}

export function minutesBetween(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(1, Math.round((end - start) / 60000));
}
