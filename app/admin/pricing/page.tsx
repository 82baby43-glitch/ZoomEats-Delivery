import { ComplianceGate } from "@/components/ComplianceGate";
import PricingEngineManager from "@/components/admin/PricingEngineManager";

export default function AdminPricingPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <PricingEngineManager />
    </ComplianceGate>
  );
}
