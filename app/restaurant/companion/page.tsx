import { ComplianceGate } from "@/components/ComplianceGate";
import RestaurantCompanionPage from "@/components/pages/RestaurantCompanionPage";

export default function RestaurantCompanionRoute() {
  return (
    <ComplianceGate roles={["vendor", "restaurant"]} requireCompliance={false} loginPath="/restaurant/login">
      <RestaurantCompanionPage />
    </ComplianceGate>
  );
}
