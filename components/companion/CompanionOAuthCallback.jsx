"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/** OAuth implicit-grant callback — tokens stay in sessionStorage only. */
export default function CompanionOAuthCallback() {
  const params = useSearchParams();

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const token = hashParams.get("access_token");
    const state = params.get("state") || hashParams.get("state");
    const provider = state?.split(":")[1];

    if (token && provider) {
      sessionStorage.setItem(`zoomeats_music_token_${provider}`, token);
      window.opener?.postMessage({ type: "companion_oauth", provider, ok: true }, window.location.origin);
    }
    window.close();
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 text-center max-w-md">
        <h1 className="font-display text-xl font-bold mb-2">Connecting music…</h1>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          You can close this window and return to ZoomEats.
        </p>
        <Link href="/driver/companion" className="btn-primary text-sm">Back to Companion Mode</Link>
      </div>
    </div>
  );
}
