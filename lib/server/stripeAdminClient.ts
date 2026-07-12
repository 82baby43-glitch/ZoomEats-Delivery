import {
  getStripeApiKey,
  getStripePublishableKey,
  getStripeWebhookSecret,
} from "./stripeEnv";

export type StripeConnectionResult = {
  ok: boolean;
  error?: string;
  mode?: "live" | "test";
};

export async function verifyStripeConnection(): Promise<StripeConnectionResult> {
  const key = getStripeApiKey();
  if (!key) return { ok: false, error: "not_configured" };

  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data?.error?.message === "string" ? data.error.message : `stripe_${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, mode: key.startsWith("sk_live") ? "live" : "test" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function maskStripeKey(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return value;
  const prefix = value.startsWith("sk_live") ? "sk_live" : value.startsWith("sk_test") ? "sk_test" : value.slice(0, 7);
  return `${prefix}_…${value.slice(-4)}`;
}

export function maskPublishableKey(value: string): string {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function getStripeConfigSummary() {
  const apiKey = getStripeApiKey();
  const webhookSecret = getStripeWebhookSecret();
  const publishableKey = getStripePublishableKey();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  return {
    configured: Boolean(apiKey),
    webhook_configured: Boolean(webhookSecret),
    publishable_configured: Boolean(publishableKey),
    api_key_preview: apiKey ? maskStripeKey(apiKey) : null,
    publishable_key_preview: publishableKey ? maskPublishableKey(publishableKey) : null,
    webhook_url: supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-webhook` : null,
  };
}

export async function verifyStripeWebhookRegistration(): Promise<{
  registered: boolean;
  endpoint_id?: string;
  detail: string;
}> {
  const apiKey = getStripeApiKey();
  const webhookUrl = getStripeConfigSummary().webhook_url;
  if (!apiKey || !webhookUrl) {
    return { registered: false, detail: "Stripe API key or webhook URL not configured" };
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data?.error?.message === "string" ? data.error.message : `stripe_${res.status}`;
      return { registered: false, detail: msg };
    }
    const match = (data.data || []).find(
      (w: { url?: string; status?: string; id?: string }) => w.url === webhookUrl && w.status === "enabled"
    );
    if (match) {
      return { registered: true, endpoint_id: match.id, detail: `Registered (${match.id})` };
    }
    return {
      registered: false,
      detail: `No enabled endpoint for ${webhookUrl} — run npm run stripe:webhook-register`,
    };
  } catch (e) {
    return { registered: false, detail: String(e) };
  }
}
