import { ComplianceGate } from "@/components/ComplianceGate";
import RestaurantOnboardingWizard from "@/components/pages/RestaurantOnboardingWizard";

export default function RestaurantOnboardingPage() {
  return (
    <ComplianceGate roles={["vendor", "restaurant"]} requireCompliance={false} loginPath="/restaurant/login">
      <RestaurantOnboardingWizard />
    </ComplianceGate>
  );
}
