import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripeApiKey } from "../server/stripeEnv";

export interface StripePayoutReadiness {
  connected: boolean;
  account_id: string | null;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  ready: boolean;
  blockers: string[];
}

async function fetchStripeAccount(accountId: string) {
  const key = getStripeApiKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Restaurant Stripe Connect payout readiness from onboarding + live account status. */
export async function evaluateStripePayoutReadiness(
  db: SupabaseClient,
  restaurantId: string
): Promise<StripePayoutReadiness> {
  const blockers: string[] = [];

  const { data: rest } = await db
    .from("restaurants")
    .select("restaurant_id,owner_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!rest) {
    return {
      connected: false,
      account_id: null,
      onboarding_complete: false,
      charges_enabled: false,
      payouts_enabled: false,
      ready: false,
      blockers: ["Restaurant not found"],
    };
  }

  const { data: onboarding } = await db
    .from("restaurant_onboarding")
    .select("stripe_connect_id,stripe_connect_complete,user_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const accountId = onboarding?.stripe_connect_id || null;
  const onboardingComplete = !!onboarding?.stripe_connect_complete;

  if (!accountId) blockers.push("Stripe Connect account not linked");
  if (!onboardingComplete) blockers.push("Stripe Connect onboarding incomplete");

  let chargesEnabled = false;
  let payoutsEnabled = false;

  if (accountId) {
    const account = await fetchStripeAccount(accountId);
    if (account) {
      chargesEnabled = !!account.charges_enabled;
      payoutsEnabled = !!account.payouts_enabled;
      if (!chargesEnabled) blockers.push("Stripe charges not enabled");
      if (!payoutsEnabled) blockers.push("Stripe payouts not enabled");
    } else if (onboardingComplete) {
      chargesEnabled = true;
      payoutsEnabled = true;
    }
  }

  const connected = !!accountId;
  const ready = connected && onboardingComplete && chargesEnabled && payoutsEnabled;

  return {
    connected,
    account_id: accountId,
    onboarding_complete: onboardingComplete,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    ready,
    blockers,
  };
}

/** Approved restaurant with coordinates and at least one priced menu item — for audit simulation. */
export async function findSimulationRestaurant(db: SupabaseClient) {
  const { data: approved } = await db
    .from("restaurants")
    .select("restaurant_id,name,latitude,longitude,approved,accepting_orders")
    .eq("approved", true)
    .limit(50);

  for (const r of approved || []) {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;

    const { count } = await db
      .from("menu_items")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", r.restaurant_id)
      .eq("available", true)
      .gt("price", 0);

    if ((count ?? 0) > 0) return r;
  }
  return null;
}
