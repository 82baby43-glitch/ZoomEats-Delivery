import { supabase } from "../supabaseClient";

/**
 * Global API Control Layer.
 *
 * Every data request in the app already flows through this module (api.get/post/...),
 * so the cross-cutting optimizations below are inherited automatically by all existing
 * and future features with no call-site changes. Public behavior is unchanged:
 * api.get/post/put/delete still resolve to `{ data }` and throw normalized errors.
 *
 * Features: request deduplication, in-memory TTL cache with stale-while-revalidate,
 * automatic cache invalidation on mutations, retry with exponential backoff + jitter
 * (retryable statuses only), AbortController timeouts, dev logging, and env-based config.
 */

type Params = Record<string, string>;

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const CFG = {
  timeoutMs: num(process.env.NEXT_PUBLIC_API_TIMEOUT_MS, 15000),
  retries: num(process.env.NEXT_PUBLIC_API_RETRIES, 2),
  retryBaseMs: num(process.env.NEXT_PUBLIC_API_RETRY_BASE_MS, 300),
  cacheTtlMs: num(process.env.NEXT_PUBLIC_API_CACHE_TTL_MS, 5000),
  // Serve stale cached GETs up to this age while revalidating in the background.
  cacheMaxAgeMs: num(process.env.NEXT_PUBLIC_API_CACHE_MAX_AGE_MS, 30000),
  mock: process.env.NEXT_PUBLIC_USE_MOCK_API === "true",
  log:
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_API_LOG !== "false",
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
// Never cache sensitive / non-idempotent-sensitive reads (payments, auth, uploads).
const NO_CACHE = /^\/(checkout|auth|uploads)(\/|$)|status/i;

type ApiError = Error & { status?: number };

const metrics = { hits: 0, misses: 0, deduped: 0, retries: 0, cancelled: 0, errors: 0 };
const log = (...a: unknown[]) => {
  if (CFG.log) console.debug("[api]", ...a);
};

interface CacheEntry {
  at: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function keyOf(path: string, params?: Params) {
  const p = params && Object.keys(params).length ? JSON.stringify(params) : "";
  return `${path}?${p}`;
}

function clearCache(reason: string) {
  if (cache.size) log("cache cleared:", reason, `(${cache.size} entries)`);
  cache.clear();
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Single network call to the Next.js backend route, with timeout + retry. */
async function invokeBackendApi(
  path: string,
  method: string,
  body?: unknown,
  params?: Params
): Promise<unknown> {
  const token = await getAccessToken();
  let attempt = 0;
  // total tries = retries + 1
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.timeoutMs);
    try {
      const res = await fetch("/api/backend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, method, body, params }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON */
      }
      if (!res.ok || data.error) {
        const status = (data.status as number) ?? res.status;
        // Retry only transient statuses.
        if (RETRYABLE.has(status) && attempt < CFG.retries) {
          attempt++;
          metrics.retries++;
          const delay = CFG.retryBaseMs * 2 ** (attempt - 1) + Math.random() * CFG.retryBaseMs;
          log("retry", `${method} ${path}`, `status=${status}`, `attempt=${attempt}`, `in ${Math.round(delay)}ms`);
          await sleep(delay);
          continue;
        }
        if (status === 401) clearCache("401 unauthorized");
        metrics.errors++;
        const err = new Error((data.error as string) || res.statusText) as ApiError;
        err.status = status;
        throw err;
      }
      return data;
    } catch (e) {
      clearTimeout(timer);
      const err = e as ApiError & { name?: string };
      // Network failure / timeout (no HTTP status) -> retry.
      if (err.status === undefined && attempt < CFG.retries) {
        if (err.name === "AbortError") metrics.cancelled++;
        attempt++;
        metrics.retries++;
        const delay = CFG.retryBaseMs * 2 ** (attempt - 1) + Math.random() * CFG.retryBaseMs;
        log("retry", `${method} ${path}`, err.name || "network", `attempt=${attempt}`, `in ${Math.round(delay)}ms`);
        await sleep(delay);
        continue;
      }
      metrics.errors++;
      throw err;
    }
  }
}

function mockResponse(method: string): unknown {
  return method === "GET" ? [] : { ok: true, mock: true };
}

async function request(
  path: string,
  method: string,
  body?: unknown,
  params?: Params
): Promise<unknown> {
  if (CFG.mock) {
    log("mock", `${method} ${path}`);
    return mockResponse(method);
  }

  const isGet = method === "GET";
  const cacheable = isGet && !NO_CACHE.test(path);

  if (!isGet) {
    // Mutations invalidate cached reads to prevent stale data.
    const data = await invokeBackendApi(path, method, body, params);
    clearCache(`${method} ${path}`);
    return data;
  }

  const key = keyOf(path, params);

  if (cacheable) {
    const entry = cache.get(key);
    if (entry) {
      const age = Date.now() - entry.at;
      if (age < CFG.cacheTtlMs) {
        metrics.hits++;
        log("cache hit", path);
        return entry.data;
      }
      if (age < CFG.cacheMaxAgeMs) {
        // Stale-while-revalidate: serve stale now, refresh in background.
        metrics.hits++;
        log("cache stale (SWR)", path);
        if (!inflight.has(key)) {
          const bg = invokeBackendApi(path, method, body, params)
            .then((d) => {
              cache.set(key, { at: Date.now(), data: d });
              return d;
            })
            .catch(() => entry.data)
            .finally(() => inflight.delete(key));
          inflight.set(key, bg);
        }
        return entry.data;
      }
    }
  }

  // Deduplicate identical in-flight GETs.
  const existing = inflight.get(key);
  if (existing) {
    metrics.deduped++;
    log("deduped", path);
    return existing;
  }

  metrics.misses++;
  const p = invokeBackendApi(path, method, body, params)
    .then((d) => {
      if (cacheable) cache.set(key, { at: Date.now(), data: d });
      return d;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const api = {
  get: async (path: string, opts: { params?: Params } = {}) => ({
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
  /** Manually invalidate the read cache (e.g. after an external change). */
  invalidate: () => clearCache("manual"),
  /** Dev-only performance metrics. */
  __metrics: () => ({ ...metrics, cacheSize: cache.size }),
};

// Dev-only debug handle for inspecting the API control layer from the console.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __zoomeatsApi?: typeof api }).__zoomeatsApi = api;
}

export const getWalletBalance = () => api.get("/wallet/balance");
export const getWalletTransactions = () => api.get("/wallet/transactions");
export const requestWalletPayout = (amount: number) => api.post("/wallet/payout", { amount });
