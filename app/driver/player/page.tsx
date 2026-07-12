import { ComplianceGate } from "@/components/ComplianceGate";
import DriverPlayerPage from "@/components/pages/DriverPlayerPage";

export default function Page() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} loginPath="/driver/login">
      <DriverPlayerPage />
    </ComplianceGate>
  );
}
