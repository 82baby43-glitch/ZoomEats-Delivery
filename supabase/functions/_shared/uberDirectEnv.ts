/** Uber Direct credentials — Deno edge mirror of lib/server/uberDirectEnv.ts */

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

export function getUberDirectConfig(): UberDirectConfig | null {
  const customerId = Deno.env.get("UBER_DIRECT_CUSTOMER_ID") || "";
  const clientId = Deno.env.get("UBER_DIRECT_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("UBER_DIRECT_CLIENT_SECRET") || "";
  const enabled = truthy(Deno.env.get("UBER_DIRECT_ENABLED") ?? "true");
  const preferred = truthy(Deno.env.get("UBER_DIRECT_PREFERRED") ?? "false");

  if (!customerId || !clientId || !clientSecret) return null;

  return {
    enabled,
    customerId,
    clientId,
    clientSecret,
    defaultPhone: Deno.env.get("UBER_DIRECT_DEFAULT_PHONE") || "+15555550100",
    preferred,
  };
}

export function isUberDirectConfigured(): boolean {
  const cfg = getUberDirectConfig();
  return Boolean(cfg?.enabled);
}
