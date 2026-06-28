import { request as gatewayRequest, invalidate } from "../api/gateway";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Build a gateway-backed query function for TanStack Query.
 * @param {string} path - API path starting with /
 * @param {object} [defaultParams] - optional default query params
 */
export function createApiQueryFn(path, defaultParams = null) {
  return async ({ queryKey, signal }) => {
    const params = queryKey?.[queryKey.length - 1];
    const merged =
      params && typeof params === "object" && !Array.isArray(params)
        ? { ...defaultParams, ...params }
        : defaultParams;

    const search = merged ? `?${new URLSearchParams(merged).toString()}` : "";
    const url = `${API_BASE}${path}${search}`;
    return gatewayRequest(url, { method: "GET", signal });
  };
}

/**
 * Gateway-backed mutation helper for TanStack Query useMutation.
 */
export function createApiMutationFn({ method = "POST", path, invalidatePattern = null }) {
  return async (body, { signal } = {}) => {
    const url = `${API_BASE}${path}`;
    const data = await gatewayRequest(url, {
      method,
      body,
      signal,
      dontCache: true,
    });

    if (invalidatePattern) invalidate(invalidatePattern);

    return data;
  };
}

export default createApiQueryFn;
