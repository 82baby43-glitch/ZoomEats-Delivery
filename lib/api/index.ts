import { supabase } from "../supabaseClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function invokeApi(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  const token = await getAccessToken();
  const { data, error } = await supabase.functions.invoke("api", {
    body: { path, method, body, params },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (error) {
    const msg = error.message || "API request failed";
    const err = new Error(msg) as Error & { status?: number };
    err.status = (error as { context?: { status?: number } }).context?.status ?? 500;
    throw err;
  }
  if (data?.error) {
    const err = new Error(data.error) as Error & { status?: number };
    err.status = data.status ?? 400;
    throw err;
  }
  return data;
}

// Compatibility wrapper mimicking axios `.get/.post` returning `{ data }`
export const api = {
  get: async (path: string, opts: { params?: Record<string, string> } = {}) => {
    const data = await invokeApi(path, "GET", undefined, opts.params);
    return { data };
  },
  post: async (path: string, body: unknown = {}, _opts = {}) => {
    const data = await invokeApi(path, "POST", body);
    return { data };
  },
  put: async (path: string, body: unknown = {}, _opts = {}) => {
    const data = await invokeApi(path, "PUT", body);
    return { data };
  },
  delete: async (path: string, _opts = {}) => {
    const data = await invokeApi(path, "DELETE");
    return { data };
  },
};

export const getWalletBalance = () => api.get("/wallet/balance");
export const getWalletTransactions = () => api.get("/wallet/transactions");
export const requestWalletPayout = (amount: number) => api.post("/wallet/payout", { amount });
