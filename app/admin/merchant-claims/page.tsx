import { ComplianceGate } from "@/components/ComplianceGate";
import AdminMerchantClaims from "@/components/admin/AdminMerchantClaims";

export default function AdminMerchantClaimsPage() {
  return (
    <ComplianceGate roles={["admin", "super_admin"]} requireCompliance={false} loginPath="/login">
      <AdminMerchantClaims />
    </ComplianceGate>
  );
}
