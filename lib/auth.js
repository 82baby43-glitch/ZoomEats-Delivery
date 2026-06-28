"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export function getAuthCallbackUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/auth/callback`;
  }
  return "https://zoom-eats-delivery.vercel.app/auth/callback";
}

export async function signInWithGoogle() {
  const redirectTo = getAuthCallbackUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser() {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (profile) {
    return {
      user_id: profile.user_id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture || authUser.user_metadata?.avatar_url || "",
      role: profile.role,
      created_at: profile.created_at,
    };
  }

  return {
    user_id: authUser.id,
    email: authUser.email || "",
    name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User",
    picture: authUser.user_metadata?.avatar_url || "",
    role: "customer",
    created_at: authUser.created_at,
  };
}

export async function ensureUserProfile() {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = authUser.email || "";
  const defaultRole = adminEmails.includes(email.toLowerCase()) ? "admin" : "customer";

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (existing) {
    const updates = {};
    const name = authUser.user_metadata?.full_name || email.split("@")[0];
    const picture = authUser.user_metadata?.avatar_url || "";
    if (existing.name !== name) updates.name = name;
    if (existing.picture !== picture) updates.picture = picture;
    if (adminEmails.includes(email.toLowerCase()) && existing.role !== "admin") {
      updates.role = "admin";
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("users").update(updates).eq("user_id", authUser.id);
    }
    return { ...existing, ...updates };
  }

  const profile = {
    user_id: authUser.id,
    email,
    name: authUser.user_metadata?.full_name || email.split("@")[0] || "User",
    picture: authUser.user_metadata?.avatar_url || "",
    role: defaultRole,
  };

  const { data, error } = await supabase.from("users").insert(profile).select().single();
  if (error) {
    const { data: retry } = await supabase.from("users").select("*").eq("user_id", authUser.id).single();
    return retry;
  }
  return data;
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        await ensureUserProfile();
        const profile = await getCurrentUser();
        setUser(profile);
        setLoading(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    window.location.href = "/";
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, refresh: checkAuth, logout }),
    [user, loading, checkAuth, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
