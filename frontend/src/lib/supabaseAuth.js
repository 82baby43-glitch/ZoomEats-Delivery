import { supabase, isSupabaseConfigured } from "./supabaseClient";

const callbackUrl = () => `${window.location.origin}/auth/callback`;

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY."
    );
  }
}

/** Google OAuth — used by existing Sign in / Get started buttons. */
export async function signInWithGoogle() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl() },
  });
  if (error) throw error;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(),
  });
  if (error) throw error;
}

export async function signOutSupabase() {
  await supabase.auth.signOut();
}

/** Entry point for login buttons — Supabase Google OAuth only. */
export function startLogin() {
  return signInWithGoogle();
}

/** Exchange Supabase session for backend HttpOnly cookie + app user profile. */
export async function syncBackendSession(api, accessToken) {
  const res = await api.post("/auth/session", { access_token: accessToken });
  return res.data.user;
}
