import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptUberSecret, encryptUberSecret } from "./uberDirectCrypto.ts";
import { getUberDirectConfigFromEnv, type UberDirectConfig, type UberDirectConfigRow } from "./uberDirectEnv.ts";

const CONFIG_ID = "default";

export type UberDirectConfigSaveInput = {
  enabled?: boolean;
  backup_enabled?: boolean;
  environment?: "sandbox" | "production";
  client_id?: string;
  client_secret?: string;
  customer_id?: string;
};

export async function loadUberDirectConfigRow(db: SupabaseClient): Promise<UberDirectConfigRow | null> {
  const { data } = await db.from("uber_direct_config").select("*").eq("id", CONFIG_ID).maybeSingle();
  return (data as UberDirectConfigRow | null) ?? null;
}

function hasCredentials(row: Partial<UberDirectConfigRow> | null): boolean {
  return Boolean(row?.client_id?.trim() && row?.client_secret?.trim() && row?.customer_id?.trim());
}

export async function resolveUberDirectConfig(db?: SupabaseClient | null): Promise<UberDirectConfig | null> {
  if (db) {
    const row = await loadUberDirectConfigRow(db);
    if (row && hasCredentials(row)) {
      let clientSecret = "";
      try {
        clientSecret = decryptUberSecret(row.client_secret!);
      } catch {
        return getUberDirectConfigFromEnv();
      }

      return {
        enabled: Boolean(row.enabled),
        backupEnabled: Boolean(row.backup_enabled),
        environment: row.environment === "production" ? "production" : "sandbox",
        customerId: row.customer_id!.trim(),
        clientId: row.client_id!.trim(),
        clientSecret,
        defaultPhone: Deno.env.get("UBER_DIRECT_DEFAULT_PHONE") || "+15555550100",
        configured: Boolean(row.configured),
      };
    }
  }

  return getUberDirectConfigFromEnv();
}

export async function saveUberDirectConfig(
  db: SupabaseClient,
  input: UberDirectConfigSaveInput
): Promise<UberDirectConfigRow> {
  const existing = await loadUberDirectConfigRow(db);
  const clientId = (input.client_id ?? existing?.client_id ?? "").trim();
  const customerId = (input.customer_id ?? existing?.customer_id ?? "").trim();
  const secretPlain = input.client_secret?.trim();
  let clientSecret = existing?.client_secret ?? "";

  if (secretPlain) {
    clientSecret = encryptUberSecret(secretPlain);
  }

  const configured = Boolean(clientId && clientSecret && customerId);
  const now = new Date().toISOString();

  const payload = {
    id: CONFIG_ID,
    enabled: input.enabled ?? existing?.enabled ?? false,
    backup_enabled: input.backup_enabled ?? existing?.backup_enabled ?? false,
    environment: input.environment ?? existing?.environment ?? "sandbox",
    client_id: clientId || null,
    client_secret: clientSecret || null,
    customer_id: customerId || null,
    configured,
    updated_at: now,
  };

  const { data, error } = await db
    .from("uber_direct_config")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as UberDirectConfigRow;
}

export async function resetUberDirectConfig(db: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from("uber_direct_config").upsert(
    {
      id: CONFIG_ID,
      enabled: false,
      backup_enabled: false,
      environment: "sandbox",
      client_id: null,
      client_secret: null,
      customer_id: null,
      configured: false,
      updated_at: now,
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);
}

export function buildUberDirectAdminConfigView(row: UberDirectConfigRow | null) {
  return {
    enabled: Boolean(row?.enabled),
    backup_enabled: Boolean(row?.backup_enabled),
    environment: row?.environment === "production" ? "production" : "sandbox",
    client_id: row?.client_id || "",
    customer_id: row?.customer_id || "",
    has_client_secret: Boolean(row?.client_secret),
    configured: Boolean(row?.configured),
  };
}
