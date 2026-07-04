import { supabase } from "../supabaseClient";
import { safeAccessObject, safeData } from "../safeData";

async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

type ApiErrorBody = { error?: string; status?: number };

function readApiError(data: unknown): string | null {
  const body = safeAccessObject<ApiErrorBody>(data, {});
  return body?.error ?? null;
}

/** Next.js API route (service role on server) — null-safe JSON parsing */
async function invokeBackendApi(
  path: string,
  method: string,
  body?: unknown,
  params?: Record<string, string>
) {
  const token = await getAccessToken();
  const res = await fetch("/api/backend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, method, body, params }),
  });

  const data = await res.json().catch(() => null);

  if (data == null) {
    if (!res.ok) {
      throw Object.assign(new Error(res.statusText || "Request failed"), { status: res.status });
    }
    return null;
  }

  const apiError = readApiError(data);
  if (!res.ok || apiError) {
    const body = safeAccessObject<ApiErrorBody>(data, {});
    const err = new Error(apiError || res.statusText || "Request failed") as Error & { status?: number };
    err.status = body.status ?? res.status;
    throw err;
  }

  return data;
}

async function request(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  return invokeBackendApi(path, method, body, params);
}

export const api = {
  get: async (path: string, opts: { params?: Record<string, string> } = {}) => ({
    data: await request(path, "GET", undefined, opts.params),
  }),
  post: async (path: string, body: unknown = {}) => ({
    data: await request(path, "POST", body),
  }),
  put: async (path: string, body: unknown = {}) => ({
    data: await request(path, "PUT", body),
  }),
  delete: async (path: string) => ({
    data: await request(path, "DELETE"),
  }),
};

export async function safeGet<T>(
  path: string,
  fallback: T,
  opts: { params?: Record<string, string> } = {}
): Promise<T> {
  try {
    const r = await api.get(path, opts);
    return safeData(r?.data, fallback);
  } catch (e) {
    console.error("[api] safeGet failed:", path, e);
    return fallback;
  }
}

export async function safePost<T>(
  path: string,
  body: unknown,
  fallback: T
): Promise<T> {
  try {
    const r = await api.post(path, body);
    return safeData(r?.data, fallback);
  } catch (e) {
    console.error("[api] safePost failed:", path, e);
    return fallback;
  }
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export { safeAccess, safeAccessObject } from "../safeData";

/** Extract `.data` from an API response with fallback. */
export function apiData<T>(response: { data?: T | null } | null | undefined, fallback: T): T {
  return safeData(response?.data, fallback);
}

export const getWalletBalance = () => api.get("/wallet/balance");
export const getWalletTransactions = () => api.get("/wallet/transactions");
export const requestWalletPayout = (amount: number) => api.post("/wallet/payout", { amount });
