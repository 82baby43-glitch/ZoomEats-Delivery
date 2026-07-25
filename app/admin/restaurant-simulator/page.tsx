import { ComplianceGate } from "@/components/ComplianceGate";
import RestaurantSimulator from "@/components/admin/RestaurantSimulator";

export default function RestaurantSimulatorPage() {
  return (
    <ComplianceGate roles={["admin", "super_admin"]} requireCompliance={false} loginPath="/login">
      <RestaurantSimulator />
    </ComplianceGate>
  );
}
