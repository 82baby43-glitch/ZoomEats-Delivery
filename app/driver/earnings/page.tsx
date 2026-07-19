import { ComplianceGate } from "@/components/ComplianceGate";
import DriverEarningsPage from "@/components/pages/DriverEarningsPage";

export default function DriverEarningsRoute() {
  return (
    <ComplianceGate roles={["delivery", "founder_driver", "admin"]} requireCompliance={false} loginPath="/driver/login">
      <DriverEarningsPage />
    </ComplianceGate>
  );
}
