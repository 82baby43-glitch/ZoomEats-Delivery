import { ComplianceGate } from "@/components/ComplianceGate";
import RestaurantLiveMapDashboard from "@/components/logistics/RestaurantLiveMapDashboard";

export default function RestaurantLiveMapPage() {
  return (
    <ComplianceGate roles={["vendor", "restaurant"]} loginPath="/restaurant/login">
      <RestaurantLiveMapDashboard />
    </ComplianceGate>
  );
}
