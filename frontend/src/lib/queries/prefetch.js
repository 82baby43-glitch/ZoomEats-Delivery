import queryClient from "../queryClient";
import { createApiQueryFn } from "../queries/apiQueryFn";
import { API_CONFIG } from "../api/config";

/**
 * Prefetch highly probable next actions through the global gateway.
 * Never aggressively prefetch large datasets.
 */
export async function prefetchApiQuery(queryKey, path, params = null) {
  if (!API_CONFIG.features.prefetch) return;

  const key = params ? [...queryKey, params] : queryKey;

  await queryClient.prefetchQuery({
    queryKey: key,
    queryFn: createApiQueryFn(path, params),
    staleTime: API_CONFIG.queryStaleMs,
  });
}

/** Prefetch restaurant menu after opening restaurant details */
export function prefetchRestaurantDetail(restaurantId) {
  return prefetchApiQuery(
    ["/restaurants", restaurantId],
    `/restaurants/${restaurantId}`
  );
}

/** Prefetch customer profile after login */
export function prefetchAuthMe() {
  return prefetchApiQuery(["/auth/me"], "/auth/me");
}

/** Prefetch dashboard summary metrics */
export function prefetchAdminMetrics() {
  return prefetchApiQuery(["/admin/metrics"], "/admin/metrics");
}

/** Prefetch next pagination page when safe */
export function prefetchNextPage(basePath, page, pageSize = 20) {
  return prefetchApiQuery(
    [basePath, { page, page_size: pageSize }],
    basePath,
    { page, page_size: pageSize }
  );
}

export default {
  prefetchApiQuery,
  prefetchRestaurantDetail,
  prefetchAuthMe,
  prefetchAdminMetrics,
  prefetchNextPage,
};
