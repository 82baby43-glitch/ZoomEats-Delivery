import { ComplianceGate } from "@/components/ComplianceGate";
import AdminPayoutDashboard from "@/components/admin/AdminPayoutDashboard";

export default function AdminPayoutsPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminPayoutDashboard />
    </ComplianceGate>
  );
}
