"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/clientErrorLog";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError("app/error", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="font-display text-2xl font-black">Something went wrong. Please refresh.</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        We hit an unexpected error loading this page.
      </p>
      <div className="mt-6 flex gap-3 justify-center">
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </div>
    </div>
  );
}
