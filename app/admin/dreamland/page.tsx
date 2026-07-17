import { ComplianceGate } from "@/components/ComplianceGate";
import DreamlandAdminAnalytics from "@/components/admin/DreamlandAdminAnalytics";

export default function DreamlandAdminPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <DreamlandAdminAnalytics />
    </ComplianceGate>
  );
}
