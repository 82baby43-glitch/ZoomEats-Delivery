import AdminProfileManagement from "@/components/pages/AdminProfileManagement";
import { ComplianceGate } from "@/components/ComplianceGate";

export default function Page() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminProfileManagement />
    </ComplianceGate>
  );
}
