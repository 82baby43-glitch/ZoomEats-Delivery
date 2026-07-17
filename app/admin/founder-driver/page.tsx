import FounderDriverDashboard from "@/components/pages/FounderDriverDashboard";
import { ComplianceGate } from "@/components/ComplianceGate";

export default function FounderDriverPage() {
  return (
    <ComplianceGate roles={["admin", "founder_driver", "super_admin"]} alsoAllowFounderDriver requireCompliance={false}>
      <FounderDriverDashboard />
    </ComplianceGate>
  );
}
