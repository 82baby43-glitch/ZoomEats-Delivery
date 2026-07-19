import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient";
import { safeAccessObject, safeData } from "../safeData";

const CACHE_TTL_MS = 3000;
const DEDUPE_TTL_MS = 5000;

type CacheEntry = { data: unknown; expires: number };
const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

/** Clear cached API responses after permission / role refresh. */
export function clearApiCache() {
  responseCache.clear();
  inflightRequests.clear();
}

function buildRequestKey(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  return JSON.stringify({ path, method, body: body ?? null, params: params ?? null });
}

function isCacheableGet(path: string) {
  return path.startsWith("/checkout/status/") || path === "/orders/my";
}

/** Stripe checkout + payment paths run on Supabase edge where Stripe secrets live. */
function prefersSupabaseEdge(path: string) {
  return (
    path.startsWith("/admin/launch-audit") ||
    path.startsWith("/admin/system-health") ||
    path.startsWith("/admin/stripe") ||
    path === "/checkout/session" ||
    path.startsWith("/checkout/status/")
  );
}

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

function parseApiResponse(res: Response, data: unknown) {
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

/**
 * Prefer Supabase Edge `api` — Stripe secrets and service role live there.
 * Fall back to Next.js `/api/backend` when Supabase is not configured (local dev).
 */
async function fetchSupabaseEdgeApi(payload: string, token: string | null) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    },
    body: payload,
  });
  const data = await res.json().catch(() => null);
  return parseApiResponse(res, data);
}

async function fetchLocalBackend(payload: string, token: string | null) {
  const res = await fetch("/api/backend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
  });
  const data = await res.json().catch(() => null);
  return parseApiResponse(res, data);
}

async function invokeBackendApi(
  path: string,
  method: string,
  body?: unknown,
  params?: Record<string, string>
) {
  const token = await getAccessToken();
  const payload = JSON.stringify({ path, method, body, params });

  // Browser: prefer same-origin /api/backend so logistics + API ship with the Vercel deploy.
  // Launch audit runs on Supabase edge where Stripe secrets are configured.
  if (typeof window !== "undefined") {
    if (prefersSupabaseEdge(path) && isSupabaseConfigured) {
      return fetchSupabaseEdgeApi(payload, token);
    }
    return fetchLocalBackend(payload, token);
  }

  if (isSupabaseConfigured) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      },
      body: payload,
    });
    const data = await res.json().catch(() => null);
    return parseApiResponse(res, data);
  }

  return fetchLocalBackend(payload, token);
}

async function request(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  const key = buildRequestKey(path, method, body, params);
  const cacheable = method === "GET" && isCacheableGet(path);

  if (cacheable) {
    const entry = responseCache.get(key);
    if (entry && entry.expires > Date.now()) return entry.data;
    if (entry) responseCache.delete(key);
  }

  const inflight = inflightRequests.get(key);
  if (inflight) return inflight;

  const promise = invokeBackendApi(path, method, body, params)
    .then((data) => {
      if (cacheable) responseCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
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
  patch: async (path: string, body: unknown = {}) => ({
    data: await request(path, "PATCH", body),
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

export const dreamlandChat = (text: string, body: Record<string, unknown> = {}) =>
  api.post("/dreamland/chat", { text, ...body });

export const dreamlandRecommend = (params: Record<string, string> = {}) =>
  api.get("/dreamland/recommend", { params });

export const dreamlandMood = (mood: string) =>
  api.post("/dreamland/mood", { mood });

export const dreamlandSurprise = () =>
  api.post("/dreamland/surprise", {});

export const dreamlandHome = () =>
  api.get("/dreamland/home");

export const dreamlandHistory = () =>
  api.get("/dreamland/history");

export const dreamlandFeedback = (body: Record<string, unknown>) =>
  api.post("/dreamland/feedback", body);

export const dreamlandRefresh = () => api.post("/dreamland/refresh", {});
export const dreamlandSession = () => api.get("/dreamland/session");
export const dreamlandMore = (params: Record<string, string> = {}) =>
  api.get("/dreamland/more", { params });
export const dreamlandAdminAnalytics = () => api.get("/dreamland/admin/analytics");
