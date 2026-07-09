import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateStripePayoutReadiness } from "./stripeConnect";

export type RestaurantLaunchStatus = "pending_location" | "pending_menu" | "pending_payout" | "ready";

export interface RestaurantReadiness {
  restaurant_id: string;
  name?: string;
  approved: boolean;
  launch_status: RestaurantLaunchStatus;
  accepting_orders: boolean;
  has_coordinates: boolean;
  menu_item_count: number;
  stripe_connected: boolean;
  stripe_payout_ready: boolean;
  can_go_live: boolean;
  blockers: string[];
  checks: Array<{ label: string; ok: boolean; detail: string }>;
}

function hasValidCoords(rest: { latitude?: number | null; longitude?: number | null }) {
  const lat = Number(rest.latitude);
  const lng = Number(rest.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

export async function evaluateRestaurantReadiness(
  db: SupabaseClient,
  restaurantId: string
): Promise<RestaurantReadiness | null> {
  const { data: rest } = await db
    .from("restaurants")
    .select("restaurant_id,name,approved,latitude,longitude,accepting_orders,launch_status,address")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!rest) return null;

  const { count: menuCount } = await db
    .from("menu_items")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("available", true);

  const coords = hasValidCoords(rest);
  const menus = (menuCount ?? 0) > 0;
  const stripe = await evaluateStripePayoutReadiness(db, restaurantId);
  const blockers: string[] = [];

  if (!coords) blockers.push("Missing map coordinates");
  if (!menus) blockers.push("No available menu items");
  if (!stripe.ready) blockers.push(...stripe.blockers);

  let launch_status: RestaurantLaunchStatus = (rest.launch_status as RestaurantLaunchStatus) || "pending_menu";
  if (!coords) launch_status = "pending_location";
  else if (!menus) launch_status = "pending_menu";
  else if (!stripe.ready) launch_status = "pending_payout";
  else launch_status = "ready";

  const can_go_live = coords && menus && stripe.ready;

  return {
    restaurant_id: restaurantId,
    name: rest.name,
    approved: !!rest.approved,
    launch_status,
    accepting_orders: !!rest.accepting_orders,
    has_coordinates: coords,
    menu_item_count: menuCount ?? 0,
    stripe_connected: stripe.connected,
    stripe_payout_ready: stripe.ready,
    can_go_live,
    blockers,
    checks: [
      { label: "Business information", ok: true, detail: "Restaurant record exists" },
      { label: "Map coordinates", ok: coords, detail: coords ? "Latitude and longitude set" : "Missing map coordinates" },
      { label: "Menu items", ok: menus, detail: menus ? `${menuCount} available items` : "No available menu items" },
      {
        label: "Stripe Connect payout",
        ok: stripe.ready,
        detail: stripe.ready
          ? "Connected account with charges and payouts enabled"
          : stripe.blockers.join("; ") || "Stripe payout setup incomplete",
      },
    ],
  };
}

export function launchStatusLabel(status: RestaurantLaunchStatus): string {
  if (status === "pending_location") return "Pending Location";
  if (status === "pending_menu") return "Pending Menu Setup";
  if (status === "pending_payout") return "Pending Stripe Payout";
  return "Ready";
}

/** Apply launch fields after approval or location/menu update. */
export async function syncRestaurantLaunchState(db: SupabaseClient, restaurantId: string) {
  const readiness = await evaluateRestaurantReadiness(db, restaurantId);
  if (!readiness) return null;

  await db.from("restaurants").update({
    launch_status: readiness.launch_status,
    accepting_orders: readiness.can_go_live,
    updated_at: new Date().toISOString(),
  }).eq("restaurant_id", restaurantId);

  return readiness;
}
