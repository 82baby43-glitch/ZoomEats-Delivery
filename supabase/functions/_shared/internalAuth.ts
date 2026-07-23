/**
 * Optional shared-secret auth for internal edge functions (dispatch, offer, routing).
 * When EDGE_FUNCTION_SECRET is set, callers must send Authorization: Bearer <secret>.
 * When unset, requests are allowed (backward compatible with existing DB triggers/cron).
 */
export function verifyInternalCall(req: Request): Response | null {
  const secret = Deno.env.get("EDGE_FUNCTION_SECRET") || "";
  if (!secret) return null;

  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return null;

  const headerSecret = req.headers.get("x-edge-function-secret") || "";
  if (headerSecret === secret) return null;

  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/** Headers for pg_net / cron callers when EDGE_FUNCTION_SECRET is configured. */
export function internalAuthHeaders(): Record<string, string> {
  const secret = Deno.env.get("EDGE_FUNCTION_SECRET") || "";
  if (!secret) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  };
}
