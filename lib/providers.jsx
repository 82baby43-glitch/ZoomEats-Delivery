"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import ErrorBoundary from "@/components/ErrorBoundary";
import SupabaseConfigBanner from "@/components/SupabaseConfigBanner";
import OfflineBanner from "@/components/OfflineBanner";
import PwaShell from "@/components/pwa/PwaShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      gcTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <SupabaseConfigBanner />
          <OfflineBanner />
          <PwaShell />
          <ErrorBoundary>{children}</ErrorBoundary>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
