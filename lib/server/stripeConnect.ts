/** Stripe Connect Express account onboarding for drivers and restaurants. */

export type StripeConnectStatus = {
  connected: boolean;
  complete: boolean;
  bank_verified: boolean;
  account_id: string | null;
  demo_mode: boolean;
};

function getStripeKey(): string {
  return (
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    ""
  );
}

async function stripeRequest(path: string, method = "GET", body?: Record<string, string>) {
  const key = getStripeKey();
  if (!key) return null;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

export async function createConnectAccount(opts: {
  email: string;
  type: "driver" | "restaurant";
  userId: string;
}): Promise<{ account_id: string; demo_mode: boolean }> {
  const key = getStripeKey();
  if (!key) {
    return { account_id: `acct_demo_${opts.userId.slice(0, 8)}`, demo_mode: true };
  }
  const data = await stripeRequest("/accounts", "POST", {
    type: "express",
    email: opts.email,
    "capabilities[transfers][requested]": "true",
    "capabilities[card_payments][requested]": opts.type === "restaurant" ? "true" : "false",
    "metadata[user_id]": opts.userId,
    "metadata[entity_type]": opts.type,
  });
  return { account_id: data.id, demo_mode: false };
}

export async function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string | null> {
  const key = getStripeKey();
  if (!key) return null;
  const data = await stripeRequest("/account_links", "POST", {
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return data.url;
}

export async function getConnectAccountStatus(accountId: string): Promise<StripeConnectStatus> {
  const key = getStripeKey();
  if (!key || accountId.startsWith("acct_demo_")) {
    return {
      connected: Boolean(accountId),
      complete: accountId.startsWith("acct_demo_complete_"),
      bank_verified: accountId.startsWith("acct_demo_complete_"),
      account_id: accountId,
      demo_mode: true,
    };
  }
  const data = await stripeRequest(`/accounts/${accountId}`);
  const complete = Boolean(data.details_submitted && data.payouts_enabled);
  const bankVerified = Boolean(data.external_accounts?.data?.length > 0 || data.payouts_enabled);
  return {
    connected: true,
    complete,
    bank_verified: bankVerified,
    account_id: accountId,
    demo_mode: false,
  };
}

export async function markDemoConnectComplete(accountId: string): Promise<string> {
  if (accountId.startsWith("acct_demo_") && !accountId.includes("complete")) {
    return accountId.replace("acct_demo_", "acct_demo_complete_");
  }
  return accountId;
}
