import { ComplianceGate } from "@/components/ComplianceGate";
import CustomerAgreementCenter from "@/components/pages/CustomerAgreementCenter";

export default function CustomerAgreementsPage() {
  return (
    <ComplianceGate roles={["customer"]} requireCompliance={false} loginPath="/login">
      <CustomerAgreementCenter />
    </ComplianceGate>
  );
}
