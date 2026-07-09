import { ComplianceGate } from "@/components/ComplianceGate";
import AdminPricing from "@/components/pages/AdminPricing";

export default function AdminPricingPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminPricing />
    </ComplianceGate>
  );
}
