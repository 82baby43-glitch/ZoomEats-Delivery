import { ComplianceGate } from "@/components/ComplianceGate";
import PendingApproval from "@/components/pages/PendingApproval";

export default function PendingApprovalPage() {
  return (
    <ComplianceGate requireCompliance={false}>
      <PendingApproval />
    </ComplianceGate>
  );
}
