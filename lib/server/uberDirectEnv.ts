/** Uber Direct credentials — set via Supabase secrets / Vercel env (never commit real values). */

export type UberDirectConfig = {
  enabled: boolean;
  customerId: string;
  clientId: string;
  clientSecret: string;
  defaultPhone: string;
  preferred: boolean;
};

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

export function getUberDirectConfig(env: NodeJS.ProcessEnv = process.env): UberDirectConfig | null {
  const customerId = env.UBER_DIRECT_CUSTOMER_ID || "";
  const clientId = env.UBER_DIRECT_CLIENT_ID || "";
  const clientSecret = env.UBER_DIRECT_CLIENT_SECRET || "";
  const enabled = truthy(env.UBER_DIRECT_ENABLED ?? "true");
  const preferred = truthy(env.UBER_DIRECT_PREFERRED ?? "false");

  if (!customerId || !clientId || !clientSecret) return null;

  return {
    enabled,
    customerId,
    clientId,
    clientSecret,
    defaultPhone: env.UBER_DIRECT_DEFAULT_PHONE || "+15555550100",
    preferred,
  };
}

export function isUberDirectConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = getUberDirectConfig(env);
  return Boolean(cfg?.enabled);
}
