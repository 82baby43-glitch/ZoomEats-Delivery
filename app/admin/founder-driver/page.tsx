import FounderDriverDashboard from "@/components/pages/FounderDriverDashboard";
import { ComplianceGate } from "@/components/ComplianceGate";

export default function FounderDriverPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false}>
      <FounderDriverDashboard />
    </ComplianceGate>
  );
}
