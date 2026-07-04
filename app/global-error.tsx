"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/clientErrorLog";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError("app/global-error", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Something went wrong. Please refresh.</h1>
          <p style={{ marginTop: 8, color: "#666" }}>The app encountered a critical error.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 24, padding: "10px 20px", cursor: "pointer", borderRadius: 8, border: "none", background: "#f59e0b", fontWeight: 700 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
