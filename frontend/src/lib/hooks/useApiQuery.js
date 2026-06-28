import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { createApiQueryFn, createApiMutationFn } from "../queries/apiQueryFn";
import { invalidateAll } from "../queryClient";

/**
 * Gateway-backed useQuery hook for future ZoomEats modules.
 * Automatically inherits deduplication, caching, retry, and cancellation defaults.
 *
 * @param {array} queryKey - TanStack Query key (use queryKeys factory)
 * @param {string} path - API path e.g. "/restaurants"
 * @param {object} [options] - useQuery options
 */
export function useApiQuery(queryKey, path, options = {}) {
  const { params, queryOptions = {} } = options;
  const key = params ? [...queryKey, params] : queryKey;

  return useQuery({
    queryKey: key,
    queryFn: createApiQueryFn(path, params),
    ...queryOptions,
  });
}

/**
 * Gateway-backed useMutation hook with automatic cache invalidation.
 */
export function useApiMutation({ method = "POST", path, invalidatePattern, mutationOptions = {} }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createApiMutationFn({ method, path, invalidatePattern }),
    onSuccess: (...args) => {
      if (invalidatePattern) {
        invalidateAll(invalidatePattern);
      }
      mutationOptions.onSuccess?.(...args);
    },
    ...mutationOptions,
  });
}

/**
 * AbortController helper — automatically aborts when the component unmounts
 * or when dependencies change (search terms, filters, etc.).
 */
export function useAbortableRequest() {
  const controllerRef = useRef(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const getSignal = () => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    return controllerRef.current.signal;
  };

  const abort = () => controllerRef.current?.abort();

  return { getSignal, abort };
}

export default useApiQuery;
