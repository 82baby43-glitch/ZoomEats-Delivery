import { ComplianceGate } from "@/components/ComplianceGate";
import CommissionManager from "@/components/admin/CommissionManager";

export default function AdminCommissionPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <CommissionManager />
    </ComplianceGate>
  );
}
