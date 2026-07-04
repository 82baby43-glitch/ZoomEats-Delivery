/** Read Stripe secrets — supports common env var names (never commit real values). */
export function getStripeApiKey(): string {
  return (
    Deno.env.get("STRIPE_API_KEY") ||
    Deno.env.get("STRIPE_SECRET_KEY") ||
    Deno.env.get("Stripe_Secret_Key") ||
    ""
  );
}

export function getStripeWebhookSecret(): string {
  return (
    Deno.env.get("STRIPE_WEBHOOK_SECRET") ||
    Deno.env.get("Stripe_Webhook_Secret") ||
    ""
  );
}

export function getStripePublishableKey(): string {
  return (
    Deno.env.get("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") ||
    Deno.env.get("STRIPE_PUBLISHABLE_KEY") ||
    ""
  );
}
