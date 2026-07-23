export function resolveEdgeFunctionSecretFromEnv(): string {
  return process.env.EDGE_FUNCTION_SECRET?.trim() || "";
}

export function internalDispatchHeaders(secret?: string): Record<string, string> {
  const resolved = secret ?? resolveEdgeFunctionSecretFromEnv();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (resolved) headers.Authorization = `Bearer ${resolved}`;
  return headers;
}
