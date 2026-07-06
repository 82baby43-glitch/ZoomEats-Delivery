import { ComplianceGate } from "@/components/ComplianceGate";
import DriverOnboardingWizard from "@/components/pages/DriverOnboardingWizard";

export default function DriverOnboardingPage() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} requireCompliance={false} loginPath="/driver/login">
      <DriverOnboardingWizard />
    </ComplianceGate>
  );
}
