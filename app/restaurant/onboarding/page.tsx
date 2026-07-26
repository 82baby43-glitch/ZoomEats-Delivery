import { Suspense } from "react";
import { ComplianceGate } from "@/components/ComplianceGate";
import RestaurantOnboardingClient from "./RestaurantOnboardingClient";

export default function RestaurantOnboardingPage() {
  return (
    <ComplianceGate roles={["vendor", "restaurant"]} requireCompliance={false} loginPath="/restaurant/login">
      <Suspense fallback={null}>
        <RestaurantOnboardingClient />
      </Suspense>
    </ComplianceGate>
  );
}
