import { ComplianceGate } from "@/components/ComplianceGate";
import DisclosureForm from "@/components/pages/DisclosureForm";

export default function DisclosurePage() {
  return (
    <ComplianceGate roles={["delivery", "driver"]} loginPath="/driver/login">
      <DisclosureForm />
    </ComplianceGate>
  );
}
