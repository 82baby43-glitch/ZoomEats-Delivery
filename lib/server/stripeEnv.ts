/** Read Stripe secrets — supports legacy Supabase secret names. */
export function getStripeApiKey(): string {
  return process.env.STRIPE_API_KEY || process.env.Stripe_Secret_Key || "";
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || process.env.Stripe_Webhook_Secret || "";
}
