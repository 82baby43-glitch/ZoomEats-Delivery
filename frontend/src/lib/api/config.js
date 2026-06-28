/**
 * Centralized API gateway configuration.
 * All values are driven by environment variables — no hardcoded production constants.
 */

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === "true" || value === "1";
};

export const API_CONFIG = {
  // Environment
  isDevelopment: process.env.NODE_ENV !== "production",
  isProduction: process.env.NODE_ENV === "production",
  useMockApi: bool(process.env.REACT_APP_USE_MOCK_API, false),
  verboseLogging: bool(
    process.env.REACT_APP_API_VERBOSE_LOGGING,
    process.env.NODE_ENV !== "production"
  ),

  // Request defaults
  timeoutMs: num(process.env.REACT_APP_API_TIMEOUT_MS, 15000),
  maxRetries: num(process.env.REACT_APP_API_MAX_RETRIES, 2),
  retryBaseDelayMs: num(process.env.REACT_APP_API_RETRY_DELAY_MS, 100),
  credentials: process.env.REACT_APP_API_CREDENTIALS || "include",

  // Cache defaults
  cacheTtlMs: num(process.env.REACT_APP_API_CACHE_TTL_MS, 30000),
  cacheVersion: process.env.REACT_APP_API_CACHE_VERSION || "v1",
  swrMultiplier: num(process.env.REACT_APP_API_SWR_MULTIPLIER, 5),
  persistentCacheEnabled: bool(process.env.REACT_APP_API_PERSISTENT_CACHE, false),
  persistentCachePrefix: process.env.REACT_APP_API_PERSISTENT_CACHE_PREFIX || "zoomeats_api_cache",

  // Search / rate-limit protection
  searchDebounceMs: num(process.env.REACT_APP_API_SEARCH_DEBOUNCE_MS, 300),
  throttleMs: num(process.env.REACT_APP_API_THROTTLE_MS, 100),

  // TanStack Query defaults
  queryStaleMs: num(process.env.REACT_APP_QUERY_STALE_MS, 5000),
  queryGcMs: num(process.env.REACT_APP_QUERY_CACHE_MS, 300000),
  queryMaxRetries: num(process.env.REACT_APP_QUERY_MAX_RETRIES, 2),

  // Performance monitoring (development only)
  slowRequestThresholdMs: num(process.env.REACT_APP_API_SLOW_REQUEST_MS, 2000),
  metricsEnabled: bool(
    process.env.REACT_APP_API_METRICS_ENABLED,
    process.env.NODE_ENV !== "production"
  ),

  // Feature flags
  features: {
    deduplication: bool(process.env.REACT_APP_API_DEDUPE, true),
    batching: bool(process.env.REACT_APP_API_BATCHING, true),
    prefetch: bool(process.env.REACT_APP_API_PREFETCH, true),
    backgroundRefresh: bool(process.env.REACT_APP_API_BACKGROUND_REFRESH, true),
  },
};

/** Request priority levels — critical work must not be blocked by background tasks. */
export const REQUEST_PRIORITY = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Path-based routing rules for cache TTL, priority, and debounce.
 * Matched against URL pathname (without origin).
 */
export const ROUTE_RULES = [
  // Payments & checkout — never cache sensitive payment state
  { pattern: /\/checkout\//, priority: REQUEST_PRIORITY.HIGH, cacheTtlMs: 0, noCache: true },
  { pattern: /\/wallet\//, priority: REQUEST_PRIORITY.HIGH, cacheTtlMs: 5000 },
  { pattern: /\/auth\//, priority: REQUEST_PRIORITY.HIGH, cacheTtlMs: 60000 },

  // Order placement
  { pattern: /\/orders$/, method: "POST", priority: REQUEST_PRIORITY.HIGH, noCache: true },
  { pattern: /\/orders\//, priority: REQUEST_PRIORITY.HIGH, cacheTtlMs: 10000 },

  // Dashboards
  { pattern: /\/vendor\//, priority: REQUEST_PRIORITY.MEDIUM, cacheTtlMs: 15000 },
  { pattern: /\/delivery\//, priority: REQUEST_PRIORITY.MEDIUM, cacheTtlMs: 10000 },
  { pattern: /\/driver\//, priority: REQUEST_PRIORITY.MEDIUM, cacheTtlMs: 10000 },
  { pattern: /\/admin\//, priority: REQUEST_PRIORITY.MEDIUM, cacheTtlMs: 15000 },

  // Restaurants & menus — cache-first when safe
  { pattern: /\/restaurants/, priority: REQUEST_PRIORITY.MEDIUM, cacheTtlMs: 60000, debounceMs: API_CONFIG.searchDebounceMs },

  // Analytics / reports — low priority background work
  { pattern: /\/chat\/history/, priority: REQUEST_PRIORITY.LOW, cacheTtlMs: 30000 },
  { pattern: /\/admin\/digest/, priority: REQUEST_PRIORITY.LOW, cacheTtlMs: 60000 },
];

export function resolveRouteRule(url, method = "GET") {
  let pathname = url;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    // keep raw path
  }

  for (const rule of ROUTE_RULES) {
    if (rule.method && rule.method.toUpperCase() !== method.toUpperCase()) continue;
    if (rule.pattern.test(pathname)) return rule;
  }

  return {
    priority: REQUEST_PRIORITY.MEDIUM,
    cacheTtlMs: API_CONFIG.cacheTtlMs,
  };
}

export default API_CONFIG;
