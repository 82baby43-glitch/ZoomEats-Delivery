import { supabase } from "../supabaseClient";
import { safeData } from "../safeData";

async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

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
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error("Invalid server response"), { status: res.status });
  }
  const errBody = data as { error?: string; status?: number };
  if (!res.ok || errBody.error) {
    const err = new Error(errBody.error || res.statusText) as Error & { status?: number };
    err.status = errBody.status ?? res.status;
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
    return safeData(r.data, fallback);
  } catch {
    return fallback;
  }
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export const getWalletBalance = () => api.get("/wallet/balance");
export const getWalletTransactions = () => api.get("/wallet/transactions");
export const requestWalletPayout = (amount: number) => api.post("/wallet/payout", { amount });
