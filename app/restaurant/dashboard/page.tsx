import { ComplianceGate } from "@/components/ComplianceGate";
import VendorDashboard from "@/components/pages/VendorDashboard";

export default function RestaurantDashboardPage() {
  return (
    <ComplianceGate roles={["vendor", "restaurant"]} loginPath="/restaurant/login">
      <VendorDashboard />
    </ComplianceGate>
  );
}
