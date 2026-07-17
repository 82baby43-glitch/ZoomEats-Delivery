/** Uber Direct credentials — env fallback; prefer DB config via uberDirectConfigStore. */

export type UberDirectEnvironment = "sandbox" | "production";

export type UberDirectConfig = {
  enabled: boolean;
  backupEnabled: boolean;
  environment: UberDirectEnvironment;
  customerId: string;
  clientId: string;
  clientSecret: string;
  defaultPhone: string;
  configured: boolean;
};

export type UberDirectConfigRow = {
  id: string;
  enabled: boolean;
  backup_enabled: boolean;
  environment: string;
  client_id: string | null;
  client_secret: string | null;
  customer_id: string | null;
  configured: boolean;
  created_at?: string;
  updated_at?: string;
};

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/** Legacy env-only resolver (used when DB config is absent). */
export function getUberDirectConfigFromEnv(env: NodeJS.ProcessEnv = process.env): UberDirectConfig | null {
  const customerId = env.UBER_DIRECT_CUSTOMER_ID || "";
  const clientId = env.UBER_DIRECT_CLIENT_ID || "";
  const clientSecret = env.UBER_DIRECT_CLIENT_SECRET || "";
  const enabled = truthy(env.UBER_DIRECT_ENABLED ?? "false");
  const backupEnabled = truthy(env.UBER_DIRECT_PREFERRED ?? "false");

  if (!customerId || !clientId || !clientSecret) return null;

  return {
    enabled,
    backupEnabled,
    environment: "sandbox",
    customerId,
    clientId,
    clientSecret,
    defaultPhone: env.UBER_DIRECT_DEFAULT_PHONE || "+15555550100",
    configured: true,
  };
}

/** @deprecated Use resolveUberDirectConfig(db) when a database client is available. */
export function getUberDirectConfig(env: NodeJS.ProcessEnv = process.env): UberDirectConfig | null {
  return getUberDirectConfigFromEnv(env);
}

export function isUberDirectConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = getUberDirectConfigFromEnv(env);
  return Boolean(cfg?.enabled && cfg.configured);
}
