import { ComplianceGate } from "@/components/ComplianceGate";
import DriverCompanionPage from "@/components/pages/DriverCompanionPage";

export default function DriverCompanionRoute() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} requireCompliance={false} loginPath="/driver/login">
      <DriverCompanionPage />
    </ComplianceGate>
  );
}
