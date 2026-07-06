import { ComplianceGate } from "@/components/ComplianceGate";
import AdminUberDirect from "@/components/pages/AdminUberDirect";

export default function AdminUberDirectPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminUberDirect />
    </ComplianceGate>
  );
}
