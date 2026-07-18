import { ComplianceGate } from "@/components/ComplianceGate";
import AdminMarketplaceManager from "@/components/admin/AdminMarketplaceManager";

export default function AdminMarketplacePage() {
  return (
    <ComplianceGate roles={["admin", "super_admin"]} requireCompliance={false} loginPath="/login">
      <AdminMarketplaceManager />
    </ComplianceGate>
  );
}
