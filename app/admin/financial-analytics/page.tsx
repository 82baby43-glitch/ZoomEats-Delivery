import { ComplianceGate } from "@/components/ComplianceGate";
import FinancialAnalyticsDashboard from "@/components/admin/FinancialAnalyticsDashboard";

export default function AdminFinancialAnalyticsPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <FinancialAnalyticsDashboard />
    </ComplianceGate>
  );
}
