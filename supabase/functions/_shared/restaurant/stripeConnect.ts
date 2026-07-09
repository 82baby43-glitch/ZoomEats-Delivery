import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripeApiKey } from "../stripeEnv.ts";

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

  if (!rest?.owner_id) {
    return {
      connected: false,
      account_id: null,
      onboarding_complete: false,
      charges_enabled: false,
      payouts_enabled: false,
      ready: false,
      blockers: ["Restaurant owner not found"],
    };
  }

  const { data: onboarding } = await db
    .from("restaurant_onboarding")
    .select("stripe_connect_id,stripe_connect_complete")
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
