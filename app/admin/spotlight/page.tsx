import { ComplianceGate } from "@/components/ComplianceGate";
import AdminSpotlight from "@/components/pages/AdminSpotlight";

export default function AdminSpotlightPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminSpotlight />
    </ComplianceGate>
  );
}
