/**
 * Global API Control Layer v2.1 — backward-compatible entry point.
 * Re-exports the centralized gateway; existing imports of apiClient continue to work.
 */
export {
  request,
  invalidate,
  clearCache,
  getCacheSnapshot,
  optimisticUpdate,
  ApiError,
} from "./api/gateway";

import gateway from "./api/gateway";
export default gateway;
