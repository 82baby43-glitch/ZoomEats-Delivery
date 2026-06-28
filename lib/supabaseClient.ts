import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

/** Quick connectivity check — Auth API + optional table probe */
export async function checkSupabaseConnection() {
  const { error: authError } = await supabase.auth.getSession();
  if (authError) {
    return { ok: false, step: "auth", error: authError.message };
  }

  const { error: dbError } = await supabase
    .from("restaurants")
    .select("restaurant_id")
    .eq("approved", true)
    .limit(1);

  if (dbError) {
    return {
      ok: true,
      connected: true,
      auth: true,
      database: false,
      hint: "Auth works but table access denied — apply supabase/migrations/20260628_supabase_auth_rls.sql",
      error: dbError.message,
    };
  }

  return { ok: true, connected: true, auth: true, database: true };
}
