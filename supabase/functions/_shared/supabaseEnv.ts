/** Shared Supabase public + server env resolution (client, server, edge). */

function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

export function getSupabasePublicUrl(): string | undefined {
  return env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
}

export function getSupabaseAnonKey(): string | undefined {
  return env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY");
}

export function isSupabasePublicConfigured(): boolean {
  return Boolean(getSupabasePublicUrl() && getSupabaseAnonKey());
}

export const SUPABASE_CONFIG_ERROR =
  "Supabase configuration incomplete. Missing public client key.";
