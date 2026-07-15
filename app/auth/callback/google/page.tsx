"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureUserProfile, getCurrentUser } from "@/lib/auth";
import {
  consumeStoredGoogleOAuthState,
  exchangeGoogleAuthCode,
} from "@/lib/googleOAuth";

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

export default function GoogleAuthCallbackPage() {
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

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const authError = params.get("error_description") || params.get("error");

        if (authError) {
          fail(String(authError));
          return;
        }

        if (!code) {
          fail("missing_google_code");
          return;
        }

        const stored = consumeStoredGoogleOAuthState();
        if (!stored) {
          fail("google_oauth_state_expired");
          return;
        }

        const idToken = await exchangeGoogleAuthCode(code, stored.verifier, stored.redirectUri);
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
          nonce: stored.nonce,
        });

        if (error) throw error;
        await complete();
      } catch (e) {
        fail(e instanceof Error ? e.message : "google_callback_failed");
      }
    })();

    const timer = setTimeout(() => {
      if (!finished) fail("timeout");
    }, CALLBACK_TIMEOUT_MS);

    return () => {
      finished = true;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="google-auth-callback">
      <div className="text-center">
        <div
          className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-4"
          style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }}
        />
        <p className="font-display text-xl">Signing you in with Google…</p>
      </div>
    </div>
  );
}
