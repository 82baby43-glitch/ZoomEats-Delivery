import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { clearSessionCache, cleanupAllSubscriptions } from "@/lib/supabaseGateway";
import { signOutSupabase, syncBackendSession } from "@/lib/supabaseAuth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const appUser = await syncBackendSession(api, session.access_token);
          setUser(appUser);
          return;
        }
      } catch {
        // fall through
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/auth/callback") {
      setLoading(false);
      return;
    }
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // continue local cleanup even if backend logout fails
    }
    await signOutSupabase();
    clearSessionCache();
    cleanupAllSubscriptions();
    setUser(null);
    window.location.href = "/";
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, refresh: checkAuth, logout }),
    [user, loading, checkAuth, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
