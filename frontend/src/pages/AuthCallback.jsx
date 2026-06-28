import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { syncBackendSession } from "@/lib/supabaseAuth";
import { api } from "@/lib/api";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    let settled = false;
    const finish = async (accessToken) => {
      if (settled) return;
      settled = true;
      try {
        const appUser = await syncBackendSession(api, accessToken);
        setUser(appUser);
        if (appUser.role !== "customer") {
          navigate("/onboarding", { state: { user: appUser } });
        } else {
          navigate("/", { state: { user: appUser } });
        }
      } catch {
        navigate("/?error=auth_failed");
      }
    };

    (async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.access_token) {
        await finish(session.access_token);
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
        if (event === "SIGNED_IN" && nextSession?.access_token) {
          subscription.unsubscribe();
          await finish(nextSession.access_token);
        }
      });

      setTimeout(async () => {
        if (settled) return;
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession?.access_token) {
          subscription.unsubscribe();
          await finish(retrySession.access_token);
        } else if (!settled) {
          subscription.unsubscribe();
          navigate("/?error=auth_failed");
        }
      }, 3000);
    })();
  }, [navigate, setUser]);

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
