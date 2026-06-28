/**
 * Global API Gateway — single gateway for every REST request in ZoomEats.
 *
 * Features:
 * - Request execution with automatic headers & credentials
 * - AbortController / timeout handling
 * - Retry with exponential backoff + jitter
 * - In-memory + optional persistent cache with SWR
 * - In-flight request deduplication
 * - Request priority scheduling
 * - Search debouncing (transparent)
 * - Development metrics & logging
 * - Mock mode for offline development
 * - Error normalization
 */

import { API_CONFIG, resolveRouteRule } from "./config";
import {
  ApiError,
  isRetryableError,
  normalizeHttpError,
  normalizeNetworkError,
} from "./errors";
import {
  buildCacheKey,
  getCacheEntry,
  setCacheEntry,
  isFresh,
  isStaleButRevalidatable,
  invalidateCache as invalidateCacheStore,
  clearCache as clearCacheStore,
  getCacheSnapshot,
  optimisticUpdate,
} from "./cache";
import { debounceRequest } from "./debounce";
import { scheduleRequest } from "./priority";
import {
  recordRequestStart,
  recordRequestEnd,
  recordRetry,
  recordCancelled,
  recordDeduped,
} from "./metrics";
import { getMockResponse } from "./mocks";

// In-flight deduplication map
const inflight = new Map();

function log(...args) {
  if (API_CONFIG.verboseLogging) console.debug("[apiGateway]", ...args);
}

function getDebounceKey(method, url, rule) {
  if (rule?.pattern) return `debounce:${method}:${rule.pattern.source}`;
  try {
    const pathname = new URL(url, "http://localhost").pathname;
    return `debounce:${method}:${pathname}`;
  } catch {
    return `debounce:${method}:${url}`;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt) {
  const base = API_CONFIG.retryBaseDelayMs * Math.pow(2, attempt);
  return base + Math.random() * base * 0.25;
}

function linkAbortSignals(controller, externalSignal) {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  externalSignal.addEventListener("abort", onAbort);
  return () => externalSignal.removeEventListener("abort", onAbort);
}

async function executeFetch(url, options) {
  const {
    method = "GET",
    body = null,
    headers = {},
    timeout = API_CONFIG.timeoutMs,
    signal = null,
    credentials = API_CONFIG.credentials,
  } = options;

  const controller = new AbortController();
  const unlink = linkAbortSignals(controller, signal);

  try {
    const hdrs = {
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...headers,
    };

    const fetchOpts = {
      method,
      headers: hdrs,
      signal: controller.signal,
      credentials,
    };

    if (body != null) fetchOpts.body = JSON.stringify(body);

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, fetchOpts);
      clearTimeout(timeoutId);

      const text = await res.text();
      const parsed = text
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return { text };
            }
          })()
        : null;

      if (!res.ok) {
        throw normalizeHttpError(res.status, parsed, url);
      }

      return parsed;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  } finally {
    unlink();
  }
}

async function fetchWithRetry(url, options, maxRetries) {
  let attempt = 0;
  let lastError = null;

  while (true) {
    attempt += 1;
    try {
      return await executeFetch(url, options);
    } catch (err) {
      const normalized = normalizeNetworkError(err);
      lastError = normalized;

      if (normalized.code === "ABORTED") {
        recordCancelled();
        throw normalized;
      }

      if (isRetryableError(normalized, normalized.status) && attempt <= maxRetries + 1) {
        recordRetry();
        const delay = backoffDelay(attempt);
        log(`retry ${attempt} after ${Math.round(delay)}ms for ${url}`);
        await sleep(delay);
        continue;
      }

      throw normalized;
    }
  }
}

function backgroundRefresh(key, url, options, cacheTtl) {
  if (!API_CONFIG.features.backgroundRefresh) return;

  const refresh = async () => {
    try {
      log("background refresh", url);
      const data = await fetchWithRetry(url, { ...options, signal: null }, options.retry ?? API_CONFIG.maxRetries);
      setCacheEntry(key, data, cacheTtl);
    } catch (e) {
      log("background refresh failed", url, e?.message);
    }
  };

  // Fire-and-forget low-priority refresh
  scheduleRequest(options.priority ?? 1, refresh).catch(() => {});
}

/**
 * Core gateway request function.
 * Backward-compatible with the original apiClient.request signature.
 */
export async function request(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const rule = resolveRouteRule(url, method);

  const cacheTtl =
    options.noCache || options.dontCache || rule.noCache
      ? 0
      : options.cacheTtl ?? rule.cacheTtlMs ?? API_CONFIG.cacheTtlMs;

  const priority = options.priority ?? rule.priority;
  const maxRetries = options.retry ?? API_CONFIG.maxRetries;
  const forceRefresh = options.forceRefresh ?? false;
  const canCache = method === "GET" && cacheTtl > 0 && !options.dontCache && !options.noCache;

  // Mock mode — no live network unless explicitly bypassed
  if (API_CONFIG.useMockApi && !options.live) {
    log("mock mode", method, url);
    return getMockResponse(url, { method, body: options.body });
  }

  const key = buildCacheKey(method, url, options.body);
  const metricsToken = recordRequestStart(url, method);

  // Cache read
  if (canCache && !forceRefresh) {
    const entry = getCacheEntry(key);
    if (isFresh(entry)) {
      log("cache hit", url);
      recordRequestEnd(metricsToken, { fromCache: true });
      return entry.data;
    }
    if (isStaleButRevalidatable(entry)) {
      log("cache stale (SWR)", url);
      backgroundRefresh(key, url, { ...options, method, priority }, cacheTtl);
      recordRequestEnd(metricsToken, { fromCache: true });
      return entry.data;
    }
  }

  // Transparent search debouncing for configured routes
  const debounceMs = options.debounceMs ?? rule.debounceMs ?? 0;
  const runRequest = (debounceSignal) =>
    performRequest(url, {
      ...options,
      method,
      cacheTtl,
      priority,
      maxRetries,
      canCache,
      key,
      signal: debounceSignal || options.signal,
    });

  if (debounceMs > 0 && method === "GET") {
    const debounceKey = getDebounceKey(method, url, rule);
    return debounceRequest(debounceKey, (debounceSignal) => runRequest(debounceSignal), debounceMs)
      .then((data) => {
        recordRequestEnd(metricsToken, { fromCache: false });
        return data;
      })
      .catch((err) => {
        recordRequestEnd(metricsToken, { fromCache: false });
        throw err;
      });
  }

  const data = await runRequest();
  recordRequestEnd(metricsToken, { fromCache: false });
  return data;
}

async function performRequest(url, ctx) {
  const { method, body, headers, timeout, signal, cacheTtl, priority, maxRetries, canCache, key } = ctx;

  // Deduplicate identical in-flight requests
  if (API_CONFIG.features.deduplication && inflight.has(key)) {
    log("dedupe in-flight", url);
    recordDeduped();
    return inflight.get(key);
  }

  const promise = scheduleRequest(priority, () =>
    fetchWithRetry(
      url,
      { method, body, headers, timeout, signal, retry: maxRetries, priority },
      maxRetries
    ).then((data) => {
      if (canCache) setCacheEntry(key, data, cacheTtl);
      return data;
    })
  );

  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));
  return promise;
}

export function invalidate(urlPattern) {
  log("cache invalidation", urlPattern);
  invalidateCacheStore(urlPattern);
}

export function clearCache() {
  clearCacheStore();
}

export { getCacheSnapshot, optimisticUpdate, ApiError };

const gateway = {
  request,
  invalidate,
  clearCache,
  getCacheSnapshot,
  optimisticUpdate,
  ApiError,
};

export default gateway;
