import React from "react";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number(process.env.REACT_APP_QUERY_STALE_MS || 5000),
      cacheTime: Number(process.env.REACT_APP_QUERY_CACHE_MS || 1000 * 60 * 5),
      retry: (failureCount, error) => {
        // Only retry network/5xx/429 errors — don't retry auth/business errors
        const status = error?.original?.status || error?.status || null;
        if (!status) return failureCount < Number(process.env.REACT_APP_QUERY_MAX_RETRIES || 2);
        if ([429, 500, 502, 503, 504].includes(status)) return failureCount < Number(process.env.REACT_APP_QUERY_MAX_RETRIES || 2);
        return false;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: false,
    }
  }
});

export default queryClient;
