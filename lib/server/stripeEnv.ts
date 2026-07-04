/** Read Stripe secrets — supports common env var names (never commit real values). */
export function getStripeApiKey(): string {
  return (
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    process.env.Stripe_Secret_Key ||
    process.env.Stripe_Api_Token ||
    ""
  );
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || process.env.Stripe_Webhook_Secret || "";
}

export function getStripePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    ""
  );
}
