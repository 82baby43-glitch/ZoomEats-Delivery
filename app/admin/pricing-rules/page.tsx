import { ComplianceGate } from "@/components/ComplianceGate";
import PricingRulesDashboard from "@/components/admin/PricingRulesDashboard";

export default function AdminPricingRulesPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <PricingRulesDashboard />
    </ComplianceGate>
  );
}
