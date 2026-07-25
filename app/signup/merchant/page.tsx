import { Suspense } from "react";
import MerchantSignupClient from "./MerchantSignupClient";

export default function MerchantSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading merchant signup…</div>}>
      <MerchantSignupClient />
    </Suspense>
  );
}
