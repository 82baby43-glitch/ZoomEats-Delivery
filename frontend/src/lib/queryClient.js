import { QueryClient } from "@tanstack/react-query";
import { API_CONFIG } from "./api/config";
import { isRetryableError, ApiError } from "./api/errors";
import { request as gatewayRequest } from "./api/gateway";
import { invalidate as invalidateGatewayCache } from "./api/gateway";

/**
 * Default query function — routes all TanStack Query reads through the global API gateway.
 */
export async function defaultQueryFn({ queryKey, signal }) {
  const [path, params] = normalizeQueryKey(queryKey);
  const search = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${process.env.REACT_APP_BACKEND_URL}/api${path}${search}`;
  return gatewayRequest(url, { method: "GET", signal });
}

function normalizeQueryKey(queryKey) {
  if (typeof queryKey === "string") return [queryKey, null];
  if (Array.isArray(queryKey)) {
    const [path, params] = queryKey;
    return [path, params || null];
  }
  return [String(queryKey), null];
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: API_CONFIG.queryStaleMs,
      gcTime: API_CONFIG.queryGcMs,
      retry: (failureCount, error) => {
        const status = error?.status ?? error?.original?.status ?? null;
        if (isRetryableError(error, status)) {
          return failureCount < API_CONFIG.queryMaxRetries;
        }
        return false;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: false,
      // TanStack Query handles in-flight deduplication automatically
      structuralSharing: true,
    },
    mutations: {
      retry: false,
      onError: (error) => {
        if (API_CONFIG.verboseLogging && error instanceof ApiError) {
          console.debug("[queryClient] mutation error", error.code, error.message);
        }
      },
    },
  },
});

/**
 * Invalidate both TanStack Query cache and gateway HTTP cache for a path pattern.
 */
export function invalidateAll(pathPattern) {
  invalidateGatewayCache(pathPattern);
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey?.[0];
      return typeof key === "string" && key.includes(pathPattern);
    },
  });
}

export default queryClient;
