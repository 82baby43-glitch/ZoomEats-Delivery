"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureUserProfile } from "@/lib/auth";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const session = sessionData?.session;

        if (!session) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get("code");

          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          } else if (hashParams.get("access_token")) {
            // PKCE / implicit hash handled by detectSessionInUrl
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        const { data: confirmedData, error: confirmedError } = await supabase.auth.getSession();
        if (confirmedError) throw confirmedError;
        const confirmed = confirmedData?.session;
        if (!confirmed) {
          router.replace("/?error=auth_failed");
          return;
        }

        await ensureUserProfile();
        if (!cancelled) router.replace("/");
      } catch {
        if (!cancelled) router.replace("/?error=auth_failed");
      }
    })();

    return () => { cancelled = true; };
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
