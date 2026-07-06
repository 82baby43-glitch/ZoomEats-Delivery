import { ComplianceGate } from "@/components/ComplianceGate";
import RoleAgreementCenter from "@/components/pages/RoleAgreementCenter";

export default function AgreementsPage() {
  return (
    <ComplianceGate roles={["delivery", "driver", "vendor", "restaurant"]} requireCompliance={false} loginPath="/login">
      <RoleAgreementCenter roleLabel="Platform" />
    </ComplianceGate>
  );
}
