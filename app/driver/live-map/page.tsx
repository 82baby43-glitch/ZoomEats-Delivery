import { ComplianceGate } from "@/components/ComplianceGate";
import DriverLiveMapDashboard from "@/components/logistics/DriverLiveMapDashboard";

export default function DriverLiveMapPage() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} loginPath="/driver/login">
      <DriverLiveMapDashboard />
    </ComplianceGate>
  );
}
