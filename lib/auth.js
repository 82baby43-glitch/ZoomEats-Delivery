"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getAuthCallbackUrl, getOAuthRedirectTo } from "@/lib/siteUrl";
import { clearApiCache } from "@/lib/api";

export { getAuthCallbackUrl };

export async function signInWithGoogle() {
  const redirectTo = getOAuthRedirectTo();
  console.info("[auth] Google OAuth via Supabase, redirectTo:", redirectTo);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) {
    console.error("[auth] signInWithOAuth failed:", error.message, error);
    throw formatAuthError(error);
  }
}

export async function signInWithEmail(email, password, opts = {}) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw formatAuthError(error);
  if (opts.remember === false) {
    // Session still persists in localStorage; user can sign out explicitly
  }
  await ensureUserProfile();
}

export async function signUpWithEmail(email, password, opts = {}) {
  const redirectTo = getAuthCallbackUrl();
  const role = opts.role || "customer";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: opts.name || email.split("@")[0],
        role,
      },
    },
  });
  if (error) {
    console.error("[auth] signUp:", error.message, error.code);
    throw formatAuthError(error);
  }
  return data;
}

function formatAuthError(error) {
  const msg = error?.message || "Authentication failed";
  const code = error?.code || "";

  if (/redirect_uri_mismatch|invalid redirect/i.test(msg)) {
    return new Error(
      "Google sign-in is misconfigured (redirect URI mismatch). Ensure Supabase and Google OAuth redirect URLs include https://zoomeats.net/auth/callback."
    );
  }
  if (/access_denied|access blocked/i.test(msg)) {
    return new Error(
      "Google sign-in was blocked. If the app is in Testing mode, add your email as a test user in Google Cloud Console."
    );
  }
  if (msg.includes("Database error saving new user")) {
    return new Error(
      "Could not create your account profile. This email may already be registered, or a legacy profile is blocking signup. Try signing in with Google, or contact support."
    );
  }
  if (code === "email_provider_disabled") {
    return new Error("Email sign-up is disabled. Use Google sign-in or ask an admin to enable email auth in Supabase.");
  }
  return new Error(msg);
}

export async function resetPassword(email) {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/$/, "")}/login?reset=1`
      : `${getAuthCallbackUrl().replace(/\/auth\/callback$/, "")}/login?reset=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function refreshUserPermissions() {
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error) console.warn("[auth] refreshSession:", error.message);
  } catch (e) {
    console.warn("[auth] refreshSession failed:", e);
  }
  clearApiCache();
  return getCurrentUser();
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[auth] getUser:", error);
    return null;
  }
  const authUser = data?.user;
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", authUser.id)
    .maybeSingle();

  const meta = authUser.user_metadata || {};
  const isFounder = profile?.is_founder === true || meta.is_founder === true || meta.isFounder === true;
  const roles = Array.isArray(meta.roles) ? meta.roles : null;

  if (profile) {
    return {
      user_id: profile.user_id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture || authUser.user_metadata?.avatar_url || "",
      role: profile.role,
      roles,
      founder_driver: profile.founder_driver === true,
      founder_driver_role: profile.founder_driver_role || null,
      is_founder: isFounder,
      isFounder,
      created_at: profile.created_at,
    };
  }

  return {
    user_id: authUser.id,
    email: authUser.email || "",
    name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User",
    picture: authUser.user_metadata?.avatar_url || "",
    role: "customer",
    roles,
    is_founder: isFounder,
    isFounder,
    created_at: authUser.created_at,
  };
}

export async function ensureUserProfile() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[auth] ensureUserProfile getUser:", error.message);
    return null;
  }
  const authUser = data?.user;
  if (!authUser) return null;

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = authUser.email || `${authUser.id}@users.zoomeats.local`;
  const defaultRole = adminEmails.includes((authUser.email || "").toLowerCase()) ? "admin" : "customer";

  const { data: existing, error: readErr } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (readErr) {
    console.error("[auth] ensureUserProfile read:", readErr.message, readErr.code);
  }

  if (existing) {
    const updates = {};
    const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split("@")[0];
    const picture = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || "";
    if (existing.name !== name) updates.name = name;
    if (existing.picture !== picture) updates.picture = picture;
    if (!existing.auth_id) updates.auth_id = authUser.id;
    if (adminEmails.includes((authUser.email || "").toLowerCase()) && existing.role !== "admin") {
      updates.role = "admin";
      updates.approval_status = "approved";
      updates.agreement_complete = true;
    }
    if (existing.is_founder === true && existing.role !== "admin") {
      updates.role = "admin";
      updates.approval_status = "approved";
      updates.agreement_complete = true;
      updates.founder_driver = true;
    }
    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase.from("users").update(updates).eq("user_id", authUser.id);
      if (updateErr) console.error("[auth] ensureUserProfile update:", updateErr.message);
    }
    return { ...existing, ...updates };
  }

  const profile = {
    user_id: authUser.id,
    auth_id: authUser.id,
    email,
    name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split("@")[0] || "User",
    picture: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || "",
    role: defaultRole,
    approval_status: defaultRole === "admin" ? "approved" : "approved",
    agreement_complete: true,
    active: true,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .upsert(profile, { onConflict: "user_id" })
    .select()
    .single();

  if (insertError) {
    console.error("[auth] upsert profile:", insertError.message, insertError.code, insertError.details);
    const { data: retry, error: retryErr } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (retryErr) console.error("[auth] retry profile:", retryErr.message);
    return retry ?? null;
  }
  return inserted;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const profile = await getCurrentUser();
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const { data: authListener, error: listenerError } = supabase.auth.onAuthStateChange(async (event) => {
      if (listenerError) {
        console.error("[auth] onAuthStateChange:", listenerError);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        await ensureUserProfile();
        const profile = await getCurrentUser();
        setUser(profile);
        setLoading(false);
        if (event === "SIGNED_IN") {
          await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("user_id", profile?.user_id).then(() => {});
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
      }
    });

    const subscription = authListener?.subscription;
    if (!subscription) return;

    return () => subscription.unsubscribe();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    window.location.href = "/";
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      loading,
      refresh: checkAuth,
      refreshPermissions: async () => {
        const profile = await refreshUserPermissions();
        setUser(profile);
        return profile;
      },
      logout,
    }),
    [user, loading, checkAuth, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
