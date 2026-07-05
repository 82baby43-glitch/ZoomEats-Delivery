import { Suspense } from "react";
import CheckoutSuccess from "@/components/pages/CheckoutSuccess";

function CheckoutSuccessFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
        style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

/** Public page — Stripe redirects here; must not require login or crash on search params. */
export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<CheckoutSuccessFallback />}>
      <CheckoutSuccess />
    </Suspense>
  );
}
