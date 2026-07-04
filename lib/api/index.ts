import { supabase } from "../supabaseClient";

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const CACHE_TTL_MS = 3000;
const DEDUPE_TTL_MS = 5000;

type CacheEntry = { data: unknown; expires: number };
const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

function buildRequestKey(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  return JSON.stringify({ path, method, body: body ?? null, params: params ?? null });
}

function isCacheableGet(path: string) {
  return path.startsWith("/checkout/status/") || path === "/orders/my";
}

function getCached(key: string) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown, ttlMs: number) {
  responseCache.set(key, { data, expires: Date.now() + ttlMs });
}

/** Next.js API route (service role on server) — works before RLS migration / without Edge Functions */
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
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data.error || res.statusText) as Error & { status?: number };
    err.status = data.status ?? res.status;
    throw err;
  }
  return data;
}

async function request(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  const key = buildRequestKey(path, method, body, params);
  const cacheable = method === "GET" && isCacheableGet(path);

  if (cacheable) {
    const cached = getCached(key);
    if (cached !== null) return cached;
  }

  const inflight = inflightRequests.get(key);
  if (inflight) return inflight;

  const promise = invokeBackendApi(path, method, body, params)
    .then((data) => {
      if (cacheable) setCached(key, data, CACHE_TTL_MS);
      return data;
    })
    .finally(() => {
      setTimeout(() => inflightRequests.delete(key), DEDUPE_TTL_MS);
    });

  inflightRequests.set(key, promise);
  return promise;
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

export const getWalletBalance = () => api.get("/wallet/balance");
export const getWalletTransactions = () => api.get("/wallet/transactions");
export const requestWalletPayout = (amount: number) => api.post("/wallet/payout", { amount });
