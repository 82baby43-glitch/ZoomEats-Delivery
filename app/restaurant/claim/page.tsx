import { Suspense } from "react";
import RestaurantPartnerSignup from "@/components/pages/RestaurantPartnerSignup";
import { LoadingSkeleton } from "@/components/ui/PageStates";

export default function Page() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading partner signup…" rows={4} /></div>}>
      <RestaurantPartnerSignup />
    </Suspense>
  );
}
