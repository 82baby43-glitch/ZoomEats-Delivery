import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      navigate("/");
      return;
    }
    const session_id = m[1];

    (async () => {
      try {
        const res = await api.post("/auth/session", { session_id });
        setUser(res.data.user);
        if (!res.data.user.role || res.data.user.role === "customer") {
          navigate("/onboarding", { state: { user: res.data.user } });
        } else {
          navigate("/", { state: { user: res.data.user } });
        }
      } catch (e) {
        navigate("/?error=auth_failed");
      }
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
