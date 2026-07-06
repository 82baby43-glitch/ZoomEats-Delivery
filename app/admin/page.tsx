import { ComplianceGate } from "@/components/ComplianceGate";
import AdminPanel from "@/components/pages/AdminPanel";

export default function AdminPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminPanel />
    </ComplianceGate>
  );
}
