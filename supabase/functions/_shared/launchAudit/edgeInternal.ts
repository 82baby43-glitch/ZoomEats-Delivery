import { internalAuthHeaders } from "../internalAuth.ts";

export function internalDispatchHeaders(): Record<string, string> {
  return internalAuthHeaders();
}
