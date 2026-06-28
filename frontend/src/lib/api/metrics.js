/**
 * Development-only performance metrics for the API gateway.
 * Automatically disabled in production.
 */

import { API_CONFIG } from "./config";

const createEmptyMetrics = () => ({
  requestCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  deduplicated: 0,
  cancelled: 0,
  retries: 0,
  slowRequests: 0,
  totalDurationMs: 0,
  byEndpoint: {},
});

let metrics = createEmptyMetrics();

function endpointKey(url, method) {
  try {
    const pathname = new URL(url, "http://localhost").pathname;
    return `${method.toUpperCase()} ${pathname}`;
  } catch {
    return `${method.toUpperCase()} ${url}`;
  }
}

export function isMetricsEnabled() {
  return API_CONFIG.metricsEnabled && API_CONFIG.isDevelopment;
}

export function recordRequestStart(url, method) {
  if (!isMetricsEnabled()) return null;
  const key = endpointKey(url, method);
  metrics.requestCount += 1;
  metrics.byEndpoint[key] = metrics.byEndpoint[key] || {
    count: 0,
    totalMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  metrics.byEndpoint[key].count += 1;
  return { key, startedAt: performance.now() };
}

export function recordRequestEnd(token, { fromCache = false, deduplicated = false } = {}) {
  if (!isMetricsEnabled() || !token) return;
  const duration = performance.now() - token.startedAt;
  metrics.totalDurationMs += duration;
  metrics.byEndpoint[token.key].totalMs += duration;

  if (fromCache) {
    metrics.cacheHits += 1;
    metrics.byEndpoint[token.key].cacheHits += 1;
  } else if (!deduplicated) {
    metrics.cacheMisses += 1;
    metrics.byEndpoint[token.key].cacheMisses += 1;
  }

  if (deduplicated) metrics.deduplicated += 1;

  if (duration >= API_CONFIG.slowRequestThresholdMs) {
    metrics.slowRequests += 1;
    if (API_CONFIG.verboseLogging) {
      console.warn(`[apiGateway] slow request ${token.key} took ${Math.round(duration)}ms`);
    }
  }
}

export function recordRetry() {
  if (isMetricsEnabled()) metrics.retries += 1;
}

export function recordCancelled() {
  if (isMetricsEnabled()) metrics.cancelled += 1;
}

export function recordCacheHit() {
  if (isMetricsEnabled()) metrics.cacheHits += 1;
}

export function recordCacheMiss() {
  if (isMetricsEnabled()) metrics.cacheMisses += 1;
}

export function recordDeduped() {
  if (isMetricsEnabled()) metrics.deduplicated += 1;
}

export function getMetrics() {
  const avgDuration =
    metrics.requestCount > 0 ? metrics.totalDurationMs / metrics.requestCount : 0;
  const cacheTotal = metrics.cacheHits + metrics.cacheMisses;
  const cacheHitRate = cacheTotal > 0 ? metrics.cacheHits / cacheTotal : 0;

  return {
    ...metrics,
    avgDurationMs: Math.round(avgDuration),
    cacheHitRate: Math.round(cacheHitRate * 1000) / 1000,
  };
}

export function resetMetrics() {
  metrics = createEmptyMetrics();
}

export function logMetricsSummary() {
  if (!isMetricsEnabled()) return;
  const snapshot = getMetrics();
  console.info("[apiGateway] metrics", snapshot);
}
