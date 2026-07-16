"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureUserProfile, getCurrentUser } from "@/lib/auth";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  delivery: "/driver/dashboard",
  driver: "/driver/dashboard",
  vendor: "/restaurant/dashboard",
  restaurant: "/restaurant/dashboard",
  dispatcher: "/dispatcher",
  customer: "/",
};

const CALLBACK_TIMEOUT_MS = 15000;

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let finished = false;

    const complete = async () => {
      if (finished) return;
      finished = true;
      await ensureUserProfile();
      const profile = await getCurrentUser();
      const storedRedirect = sessionStorage.getItem("auth_redirect");
      sessionStorage.removeItem("auth_redirect");
      const defaultHome = ROLE_HOME[profile?.role || "customer"] || "/onboarding";
      router.replace(storedRedirect || defaultHome);
    };

    const fail = (reason?: string) => {
      if (finished) return;
      finished = true;
      const q = reason ? `?error=auth_failed&reason=${encodeURIComponent(reason)}` : "?error=auth_failed";
      router.replace(`/login${q}`);
    };

    // detectSessionInUrl handles PKCE — wait for SIGNED_IN / INITIAL_SESSION, don't double-exchange.
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (finished) return;
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        try {
          await complete();
        } catch (e) {
          fail(e instanceof Error ? e.message : "profile_sync_failed");
        }
      }
    });

    (async () => {
      try {
        const { data: existing, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (existing?.session) {
          await complete();
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const authError = params.get("error_description") || params.get("error");

        if (authError) {
          console.error("[auth] OAuth callback error:", authError);
          fail(String(authError));
          return;
        }

        // Fallback: if auto-detect hasn't fired yet, exchange once after a short delay.
        if (code) {
          await new Promise((r) => setTimeout(r, 600));
          const { data: afterWait } = await supabase.auth.getSession();
          if (afterWait?.session) {
            await complete();
            return;
          }
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            const { data: retry } = await supabase.auth.getSession();
            if (retry?.session) {
              await complete();
              return;
            }
            throw exchangeError;
          }
          await complete();
        }
      } catch (e) {
        console.error("[auth] callback failed:", e);
        fail(e instanceof Error ? e.message : "callback_failed");
      }
    })();

    const timer = setTimeout(() => {
      if (!finished) fail("timeout");
    }, CALLBACK_TIMEOUT_MS);

    return () => {
      finished = true;
      clearTimeout(timer);
      authListener?.subscription?.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="auth-callback">
      <div className="text-center">
        <div
          className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-4"
          style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }}
        />
        <p className="font-display text-xl">Signing you in…</p>
      </div>
    </div>
  );
}
