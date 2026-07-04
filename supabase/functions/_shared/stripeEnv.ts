/** Read Stripe secrets — supports legacy Supabase secret names. */
export function getStripeApiKey(): string {
  return Deno.env.get("STRIPE_API_KEY") || Deno.env.get("Stripe_Secret_Key") || "";
}

export function getStripeWebhookSecret(): string {
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") || Deno.env.get("Stripe_Webhook_Secret") || "";
}
