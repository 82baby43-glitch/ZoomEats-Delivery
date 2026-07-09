"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/** OAuth implicit-grant callback — tokens stay in sessionStorage only. */
export default function CompanionOAuthCallback() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const queryError = params.get("error");
    const hashError = hashParams.get("error");
    const oauthError = queryError || hashError;

    if (oauthError) {
      sessionStorage.removeItem("companion_music_pending");
      const desc = params.get("error_description") || hashParams.get("error_description") || "";
      const q = new URLSearchParams({ music_oauth_error: oauthError });
      if (desc) q.set("error_description", desc);
      router.replace(`/driver/companion?${q.toString()}`);
      return;
    }

    const token = hashParams.get("access_token");
    const state = params.get("state") || hashParams.get("state");
    const provider = state?.includes("youtube_music")
      ? "youtube_music"
      : state?.includes("spotify")
        ? "spotify"
        : state?.split(":")[1];

    if (token && provider) {
      sessionStorage.setItem(`zoomeats_music_token_${provider}`, token);
      sessionStorage.setItem("companion_music_pending", provider);

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "companion_oauth", provider, ok: true }, window.location.origin);
        window.close();
        return;
      }

      router.replace(`/driver/companion?music_oauth=${provider}`);
      return;
    }

    router.replace("/driver/companion?music_oauth_error=missing_token");
  }, [params, router]);

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
