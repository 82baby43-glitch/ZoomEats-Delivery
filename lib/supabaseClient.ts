import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Placeholders allow `next build` when env vars are not injected (CI/Vercel preview setup). */
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "[ZoomEats] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — auth and data will not work."
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
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      step: "config",
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    };
  }

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
