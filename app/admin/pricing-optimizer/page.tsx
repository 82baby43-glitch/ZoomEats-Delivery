import { ComplianceGate } from "@/components/ComplianceGate";
import PricingOptimizerDashboard from "@/components/admin/PricingOptimizerDashboard";

export default function AdminPricingOptimizerPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <PricingOptimizerDashboard />
    </ComplianceGate>
  );
}
