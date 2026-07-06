import { ComplianceGate } from "@/components/ComplianceGate";
import DeliveryDashboard from "@/components/pages/DeliveryDashboard";

export default function DriverDashboardPage() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} loginPath="/driver/login">
      <DeliveryDashboard />
    </ComplianceGate>
  );
}
