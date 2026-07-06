import type { SupabaseClient } from "@supabase/supabase-js";

export type StripeAccountSnapshot = {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  identity_verified: boolean;
  requires_reverification: boolean;
  disabled_reason: string | null;
  requirements_due: string[];
};

export type ConnectStatus = StripeAccountSnapshot & {
  payout_ready: boolean;
  stripe_connect_complete: boolean;
  account_id: string | null;
};

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function isPayoutReady(s: Pick<StripeAccountSnapshot, "charges_enabled" | "payouts_enabled" | "details_submitted" | "requires_reverification">) {
  return Boolean(
    s.charges_enabled &&
    s.payouts_enabled &&
    s.details_submitted &&
    !s.requires_reverification
  );
}

export function parseStripeAccount(acct: Record<string, unknown>): StripeAccountSnapshot {
  const requirements = (acct.requirements || {}) as Record<string, unknown>;
  const currentlyDue = Array.isArray(requirements.currently_due) ? requirements.currently_due as string[] : [];
  const pastDue = Array.isArray(requirements.past_due) ? requirements.past_due as string[] : [];
  const eventuallyDue = Array.isArray(requirements.eventually_due) ? requirements.eventually_due as string[] : [];
  const disabledReason = (requirements.disabled_reason as string) || (acct.disabled_reason as string) || null;

  const individual = (acct.individual || {}) as Record<string, unknown>;
  const verification = (individual.verification || {}) as Record<string, unknown>;
  const identityVerified = verification.status === "verified";

  const requiresReverification = Boolean(
    disabledReason ||
    pastDue.length > 0 ||
    (currentlyDue.length > 0 && Boolean(acct.details_submitted))
  );

  return {
    stripe_account_id: String(acct.id || ""),
    charges_enabled: Boolean(acct.charges_enabled),
    payouts_enabled: Boolean(acct.payouts_enabled),
    details_submitted: Boolean(acct.details_submitted),
    identity_verified: identityVerified,
    requires_reverification: requiresReverification,
    disabled_reason: disabledReason,
    requirements_due: [...new Set([...currentlyDue, ...pastDue, ...eventuallyDue])],
  };
}

export async function fetchStripeAccount(stripeKey: string, stripeAccountId: string) {
  const res = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const acct = await res.json();
  if (!res.ok) {
    const msg = (acct as { error?: { message?: string } }).error?.message || "Stripe account fetch failed";
    throw new Error(msg);
  }
  return parseStripeAccount(acct as Record<string, unknown>);
}

export async function createStripeExpressAccount(stripeKey: string, email: string, metadata: Record<string, string>) {
  const params = new URLSearchParams({
    type: "express",
    country: "US",
    email,
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
  });
  for (const [k, v] of Object.entries(metadata)) {
    params.set(`metadata[${k}]`, v);
  }
  const res = await fetch("https://api.stripe.com/v1/accounts", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const acct = await res.json();
  if (!res.ok) {
    const msg = (acct as { error?: { message?: string } }).error?.message || "Stripe account creation failed";
    throw new Error(msg);
  }
  return String((acct as { id: string }).id);
}

export async function createStripeAccountLink(
  stripeKey: string,
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string,
  type: "account_onboarding" | "account_update" = "account_onboarding"
) {
  const params = new URLSearchParams({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type,
  });
  const res = await fetch("https://api.stripe.com/v1/account_links", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const link = await res.json();
  if (!res.ok) {
    const msg = (link as { error?: { message?: string } }).error?.message || "Stripe link failed";
    throw new Error(msg);
  }
  return String((link as { url: string }).url);
}

export async function syncConnectAccount(
  db: SupabaseClient,
  opts: {
    stripeKey: string;
    userId: string;
    entityType: "driver" | "restaurant";
    entityRefId?: string | null;
    stripeAccountId: string;
  }
): Promise<ConnectStatus> {
  const snapshot = await fetchStripeAccount(opts.stripeKey, opts.stripeAccountId);
  const payoutReady = isPayoutReady(snapshot);
  const now = new Date().toISOString();

  const row = {
    user_id: opts.userId,
    entity_type: opts.entityType,
    entity_ref_id: opts.entityRefId || null,
    stripe_account_id: snapshot.stripe_account_id,
    charges_enabled: snapshot.charges_enabled,
    payouts_enabled: snapshot.payouts_enabled,
    details_submitted: snapshot.details_submitted,
    identity_verified: snapshot.identity_verified,
    requires_reverification: snapshot.requires_reverification,
    disabled_reason: snapshot.disabled_reason,
    requirements_due: snapshot.requirements_due,
    last_synced_at: now,
    updated_at: now,
  };

  const { data: existing } = await db
    .from("stripe_connect_accounts")
    .select("account_id")
    .eq("stripe_account_id", snapshot.stripe_account_id)
    .maybeSingle();

  let accountId = existing?.account_id as string | undefined;
  if (!accountId) {
    accountId = uid("sca");
    await db.from("stripe_connect_accounts").insert({ account_id: accountId, ...row });
  } else {
    await db.from("stripe_connect_accounts").update(row).eq("account_id", accountId);
  }

  const entityPatch = {
    stripe_connect_id: snapshot.stripe_account_id,
    stripe_connect_complete: payoutReady,
    payouts_enabled: snapshot.payouts_enabled,
    identity_verified: snapshot.identity_verified,
    requires_reverification: snapshot.requires_reverification,
    accepting_orders: payoutReady,
    updated_at: now,
  };

  if (opts.entityType === "driver") {
    await db.from("drivers").update(entityPatch).eq("user_id", opts.userId);
    await db.from("driver_onboarding").update({
      stripe_connect_id: snapshot.stripe_account_id,
      stripe_connect_complete: payoutReady,
      updated_at: now,
    }).eq("user_id", opts.userId);
  } else {
    if (opts.entityRefId) {
      await db.from("restaurants").update(entityPatch).eq("restaurant_id", opts.entityRefId);
    } else {
      await db.from("restaurants").update(entityPatch).eq("owner_id", opts.userId);
    }
    await db.from("restaurant_onboarding").update({
      stripe_connect_id: snapshot.stripe_account_id,
      stripe_connect_complete: payoutReady,
      updated_at: now,
    }).eq("user_id", opts.userId);
  }

  await ensurePayoutNotification(db, opts.userId, snapshot, payoutReady);

  return {
    ...snapshot,
    payout_ready: payoutReady,
    stripe_connect_complete: payoutReady,
    account_id: accountId || null,
  };
}

export async function ensurePayoutNotification(
  db: SupabaseClient,
  userId: string,
  snapshot: StripeAccountSnapshot,
  payoutReady: boolean
) {
  const eventType = snapshot.requires_reverification
    ? "payout_reverification_required"
    : payoutReady
      ? "payout_setup_complete"
      : "payout_setup_required";

  const { data: existing } = await db
    .from("compliance_notifications")
    .select("notification_id")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .is("read_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  const title = snapshot.requires_reverification
    ? "Payout reverification required"
    : payoutReady
      ? "Payout setup complete"
      : "Complete payout setup";

  const body = snapshot.requires_reverification
    ? "Stripe needs updated identity or banking information before payouts can continue."
    : payoutReady
      ? "Your Stripe Connect account is ready to receive payouts."
      : "Set up Stripe Connect to receive payouts and accept orders.";

  await db.from("compliance_notifications").insert({
    notification_id: uid("cn"),
    user_id: userId,
    channel: "in_app",
    event_type: eventType,
    title,
    body,
  });
}

export async function resolveStripeAccountId(
  db: SupabaseClient,
  userId: string,
  entityType: "driver" | "restaurant"
): Promise<string | null> {
  const { data: connectRow } = await db
    .from("stripe_connect_accounts")
    .select("stripe_account_id")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectRow?.stripe_account_id) return connectRow.stripe_account_id as string;

  if (entityType === "driver") {
    const { data: onboarding } = await db.from("driver_onboarding").select("stripe_connect_id").eq("user_id", userId).maybeSingle();
    if (onboarding?.stripe_connect_id) return onboarding.stripe_connect_id as string;
    const { data: driver } = await db.from("drivers").select("stripe_connect_id").eq("user_id", userId).maybeSingle();
    return (driver?.stripe_connect_id as string) || null;
  }

  const { data: onboarding } = await db.from("restaurant_onboarding").select("stripe_connect_id").eq("user_id", userId).maybeSingle();
  if (onboarding?.stripe_connect_id) return onboarding.stripe_connect_id as string;
  const { data: rest } = await db.from("restaurants").select("stripe_connect_id").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (rest?.stripe_connect_id as string) || null;
}
