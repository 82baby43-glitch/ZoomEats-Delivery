import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient";
import { safeAccessObject, safeData } from "../safeData";

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
 * Prefer Supabase Edge `api` — Stripe secrets live there.
 * Fall back to Next.js `/api/backend` when Supabase is not configured (local dev).
 */
async function invokeBackendApi(
  path: string,
  method: string,
  body?: unknown,
  params?: Record<string, string>
) {
  const token = await getAccessToken();
  const payload = JSON.stringify({ path, method, body, params });

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

export const getConnectStatus = (entityType: "driver" | "restaurant") =>
  api.get(entityType === "restaurant" ? "/connect/restaurant/status" : "/connect/driver/status");

export const startConnectOnboarding = (entityType: "driver" | "restaurant", returnUrl?: string) =>
  api.post(entityType === "restaurant" ? "/connect/restaurant/onboard" : "/connect/driver/onboard", { return_url: returnUrl });

export const startConnectReverification = (returnUrl?: string) =>
  api.post("/connect/reverify", { return_url: returnUrl });

export const getPayoutNotifications = () => api.get("/notifications");

export const getNotifications = () => api.get("/notifications");
export const markNotificationRead = (id: string) => api.post(`/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => api.post("/notifications/read-all", {});
export const getNotificationPreferences = () => api.get("/notifications/preferences");
export const updateNotificationPreferences = (body: Record<string, unknown>) => api.put("/notifications/preferences", body);
export const runNotificationScan = () => api.post("/admin/notifications/scan", {});

export const getAdminPayoutDashboard = () => api.get("/admin/connect/dashboard");

export const getComplianceOverview = (params: Record<string, string> = {}) =>
  api.get("/admin/compliance/overview", { params });

export const exportComplianceCsv = (params: Record<string, string> = {}) =>
  api.get("/admin/compliance/export/csv", { params });

export const exportCompliancePdf = (params: Record<string, string> = {}) =>
  api.get("/admin/compliance/export/pdf", { params });

export const getComplianceAudit = (params: Record<string, string> = {}) =>
  api.get("/admin/compliance/audit", { params });

export const presignRestaurantMedia = (body: Record<string, unknown>) =>
  api.post("/vendor/media/presign", body);

export const saveMediaEnhancement = (body: Record<string, unknown>) =>
  api.post("/vendor/media/enhancements", body);

export const getMediaEnhancements = () => api.get("/vendor/media/enhancements");

export const approveMediaEnhancement = (id: string, body: Record<string, unknown> = {}) =>
  api.post(`/vendor/media/enhancements/${id}/approve`, body);

export const rejectMediaEnhancement = (id: string) =>
  api.post(`/vendor/media/enhancements/${id}/reject`, {});

export const getTaxDashboard = (year: number) =>
  api.get("/tax/dashboard", { params: { year: String(year) } });

export const presignW9Upload = (body: Record<string, unknown>) =>
  api.post("/tax/w9/presign", body);

export const submitW9Document = (path: string) =>
  api.post("/tax/w9/submit", { path });

export const getAdminTaxDashboard = (year: number) =>
  api.get("/admin/tax/dashboard", { params: { year: String(year) } });

export const syncTaxPayments = (year: number) =>
  api.post("/admin/tax/sync-payments", { year });

export const export1099NecCsv = (year: number) =>
  api.get("/admin/tax/export/1099-nec", { params: { year: String(year) } });

export const exportIrsTaxCsv = (year: number) =>
  api.get("/admin/tax/export/irs-csv", { params: { year: String(year) } });

export const generateYearEndTaxReport = (year: number) =>
  api.get("/admin/tax/year-end", { params: { year: String(year) } });
