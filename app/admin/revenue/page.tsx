import { ComplianceGate } from "@/components/ComplianceGate";
import AdminRevenue from "@/components/pages/AdminRevenue";

export default function AdminRevenuePage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminRevenue />
    </ComplianceGate>
  );
}
