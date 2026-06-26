/*
Global API Control Layer: apiClient
Features implemented:
- Deduplication of in-flight GET requests
- In-memory caching with TTL and SWR
- AbortController support
- Retry with exponential backoff + jitter for retryable errors
- Simple metrics & dev logging (controlled by env)
- Configurable via environment variables

This client is backward-compatible for JSON REST endpoints used by the app.
*/

const DEFAULT_TTL = Number(process.env.REACT_APP_API_CACHE_TTL_MS || 30000);
const DEFAULT_TIMEOUT = Number(process.env.REACT_APP_API_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.REACT_APP_API_MAX_RETRIES || 2);
const DEV_LOG = process.env.NODE_ENV !== "production";
const USE_MOCK = process.env.REACT_APP_USE_MOCK_API === "true";

function now() {
  return Date.now();
}

class ApiError extends Error {
  constructor(message, { status, code, original } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.original = original;
  }
}

// Simple in-memory cache
const cache = new Map(); // key -> { ts, ttl, data, staleAt }
// In-flight dedupe map
const inflight = new Map(); // key -> Promise

function cacheKey(method, url, body) {
  let b = "";
  try { b = body ? JSON.stringify(body) : "" } catch(e) { b = String(body) }
  return `${method.toUpperCase()} ${url} ${b}`;
}

function isRetryable(err, status) {
  if (!err && status == null) return false;
  // Retry for network errors or 5xx/429
  if (!status) return true; // network
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return false;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function request(url, { method = "GET", body = null, headers = {}, timeout = DEFAULT_TIMEOUT, cacheTtl = DEFAULT_TTL, forceRefresh = false, retry = MAX_RETRIES, signal = null, dontCache = false } = {}) {
  if (USE_MOCK) {
    if (DEV_LOG) console.info("[apiClient] MOCK MODE enabled, returning empty mock for", url);
    return {}; // lightweight mock — for local dev teams can replace with richer mocks
  }

  const key = cacheKey(method, url, body);

  // Only cache GET
  const canCache = method.toUpperCase() === "GET" && !dontCache;

  if (canCache && !forceRefresh) {
    const ent = cache.get(key);
    if (ent) {
      const age = now() - ent.ts;
      if (age < ent.ttl) {
        if (DEV_LOG) console.debug(`[apiClient] cache hit ${url}`);
        return ent.data;
      }
      // stale while revalidate: return stale immediately and trigger background refresh
      if (age < ent.ttl * 5) { // soft cap for SWR
        if (DEV_LOG) console.debug(`[apiClient] cache stale (SWR) ${url}`);
        // kick background refresh
        _backgroundRefresh(key, url, { method, body, headers, timeout, cacheTtl, retry, signal, dontCache });
        return ent.data;
      }
      // expired fully — fallthrough to fetch
      if (DEV_LOG) console.debug(`[apiClient] cache expired ${url}`);
    }
  }

  // Deduplicate in-flight identical requests
  if (inflight.has(key)) {
    if (DEV_LOG) console.debug(`[apiClient] dedupe in-flight ${url}`);
    return inflight.get(key);
  }

  // Build the fetch promise
  const controller = new AbortController();
  const masterSignal = controller.signal;
  if (signal) {
    // link provided signal -> abort ours when external aborted
    signal.addEventListener("abort", () => controller.abort());
  }

  const fetchPromise = (async () => {
    let attempt = 0;
    let lastErr = null;
    while (true) {
      attempt += 1;
      try {
        const hdrs = Object.assign({ "Content-Type": "application/json" }, headers || {});
        const opts = { method, headers: hdrs, signal: masterSignal };
        if (body != null) opts.body = JSON.stringify(body);
        const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new ApiError("timeout", { code: "timeout" })), timeout));
        const res = await Promise.race([fetch(url, opts), timeoutPromise]);
        if (!res.ok) {
          const text = await res.text();
          const status = res.status;
          const parsed = (() => {
            try { return JSON.parse(text); } catch (e) { return { text }; }
          })();
          const apiErr = new ApiError("HTTP error", { status, original: parsed });
          if (isRetryable(null, status) && attempt <= retry) {
            lastErr = apiErr;
            const backoff = Math.pow(2, attempt) * 100 + Math.random() * 100;
            if (DEV_LOG) console.debug(`[apiClient] retry ${attempt} after ${backoff}ms for ${url} (status=${status})`);
            await sleep(backoff);
            continue;
          }
          throw apiErr;
        }
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (canCache) {
          cache.set(key, { ts: now(), ttl: cacheTtl, data });
        }
        return data;
      } catch (err) {
        if (err.name === 'AbortError') {
          if (DEV_LOG) console.debug(`[apiClient] request aborted ${url}`);
          throw new ApiError("aborted", { code: "aborted", original: err });
        }
        const status = err && err.status ? err.status : null;
        if (isRetryable(err, status) && attempt <= retry) {
          lastErr = err;
          const backoff = Math.pow(2, attempt) * 100 + Math.random() * 100;
          if (DEV_LOG) console.debug(`[apiClient] network retry ${attempt} after ${backoff}ms for ${url}`);
          await sleep(backoff);
          continue;
        }
        throw new ApiError(err.message || "network error", { original: err });
      }
    }
  })();

  inflight.set(key, fetchPromise);
  // ensure removal when settled
  fetchPromise.finally(() => inflight.delete(key));
  return fetchPromise;
}

async function _backgroundRefresh(key, url, opts) {
  try {
    if (DEV_LOG) console.debug(`[apiClient] background refresh ${url}`);
    const data = await request(url, Object.assign({}, opts, { forceRefresh: true }));
    cache.set(key, { ts: now(), ttl: opts.cacheTtl || DEFAULT_TTL, data });
  } catch (e) {
    if (DEV_LOG) console.debug(`[apiClient] background refresh failed ${url}:`, e.message || e);
  }
}

export function invalidate(urlPattern) {
  // wildcard simple invalidation: if urlPattern is substring of key
  for (const k of Array.from(cache.keys())) {
    if (k.includes(urlPattern)) cache.delete(k);
  }
}

export function clearCache() { cache.clear(); }

export function getCacheSnapshot() {
  const out = {};
  for (const [k, v] of cache.entries()) out[k] = { ts: v.ts, ttl: v.ttl };
  return out;
}

export default { request, invalidate, clearCache, getCacheSnapshot, ApiError };
