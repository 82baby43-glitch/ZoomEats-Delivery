/** Shared Supabase public + server env resolution (client, server, edge). */

export function getSupabasePublicUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    undefined
  );
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    undefined
  );
}

export function isSupabasePublicConfigured(): boolean {
  return Boolean(getSupabasePublicUrl() && getSupabaseAnonKey());
}

export const SUPABASE_CONFIG_ERROR =
  "Supabase configuration incomplete. Missing public client key.";
