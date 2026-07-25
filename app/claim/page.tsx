import { ComplianceGate } from "@/components/ComplianceGate";
import ClaimBusinessWizard from "@/components/claim/ClaimBusinessWizard";

export default function ClaimBusinessPage() {
  return (
    <ComplianceGate requireCompliance={false} loginPath="/login?redirect=/claim">
      <ClaimBusinessWizard />
    </ComplianceGate>
  );
}
