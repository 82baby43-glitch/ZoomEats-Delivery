import { ComplianceGate } from "@/components/ComplianceGate";
import AdminStripe from "@/components/pages/AdminStripe";

export default function AdminStripePage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminStripe />
    </ComplianceGate>
  );
}
