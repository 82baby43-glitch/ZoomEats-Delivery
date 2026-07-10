import { ComplianceGate } from "@/components/ComplianceGate";
import DriverNavigationScreen from "@/components/logistics/DriverNavigationScreen";

export const dynamic = "force-dynamic";

export default function DriverNavigatePage() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} loginPath="/driver/login">
      <DriverNavigationScreen />
    </ComplianceGate>
  );
}
