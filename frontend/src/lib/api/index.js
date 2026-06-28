/**
 * Unified API gateway exports.
 * All future ZoomEats modules should import from here.
 */

export { default as apiGateway, request, invalidate, clearCache, getCacheSnapshot, optimisticUpdate } from "./gateway";
export { ApiError, API_ERROR_CODES, isRetryableError, normalizeSupabaseError, normalizeStripeError } from "./errors";
export { API_CONFIG, REQUEST_PRIORITY, resolveRouteRule } from "./config";
export { getMetrics, resetMetrics, logMetricsSummary, isMetricsEnabled } from "./metrics";
export { getMockResponse } from "./mocks";
export { buildCacheKey } from "./cache";
export { default } from "./gateway";
