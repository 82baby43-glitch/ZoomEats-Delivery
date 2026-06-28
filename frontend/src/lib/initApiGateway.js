/**
 * Gateway bootstrap — development metrics and global initialization.
 */

import { API_CONFIG } from "./api/config";
import { logMetricsSummary } from "./api/metrics";

let initialized = false;

export function initApiGateway() {
  if (initialized) return;
  initialized = true;

  if (API_CONFIG.verboseLogging) {
    console.info("[apiGateway] initialized", {
      mock: API_CONFIG.useMockApi,
      cacheTtlMs: API_CONFIG.cacheTtlMs,
      deduplication: API_CONFIG.features.deduplication,
      batching: API_CONFIG.features.batching,
      prefetch: API_CONFIG.features.prefetch,
    });
  }

  if (API_CONFIG.metricsEnabled && API_CONFIG.isDevelopment) {
    // Periodic metrics summary in development
    setInterval(() => logMetricsSummary(), 60000);
  }
}

export default initApiGateway;
