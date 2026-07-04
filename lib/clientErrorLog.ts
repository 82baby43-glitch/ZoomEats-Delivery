/** Client-side error logging — console + optional backend (fails silently). */

export function logClientError(context: string, error: unknown, meta: Record<string, unknown> = {}) {
  const payload = {
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ts: new Date().toISOString(),
    ...meta,
  };
  console.error("[client-error]", payload);

  if (typeof window === "undefined") return;

  try {
    void fetch("/api/backend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/",
        method: "GET",
        body: { _client_error_log: payload },
      }),
    }).catch(() => {});
  } catch {
    // Never throw from error logging
  }
}
