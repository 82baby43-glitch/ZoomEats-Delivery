import { ComplianceGate } from "@/components/ComplianceGate";
import AdminLogisticsDashboard from "@/components/logistics/AdminLogisticsDashboard";

export default function AdminLogisticsPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false}>
      <AdminLogisticsDashboard />
    </ComplianceGate>
  );
}
