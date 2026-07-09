import { ComplianceGate } from "@/components/ComplianceGate";
import RoleAgreementCenter from "@/components/pages/RoleAgreementCenter";

export default function RestaurantOnboardingPage() {
  return (
    <ComplianceGate roles={["vendor", "restaurant"]} requireCompliance={false} loginPath="/restaurant/login">
      <RoleAgreementCenter roleLabel="Restaurant" />
    </ComplianceGate>
  );
}
