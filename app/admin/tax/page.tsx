import { ComplianceGate } from "@/components/ComplianceGate";
import AdminTax from "@/components/pages/AdminTax";

export default function AdminTaxPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminTax />
    </ComplianceGate>
  );
}
