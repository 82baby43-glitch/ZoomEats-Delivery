import { ComplianceGate } from "@/components/ComplianceGate";
import AdminCompliance from "@/components/pages/AdminCompliance";

export default function AdminCompliancePage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminCompliance />
    </ComplianceGate>
  );
}
