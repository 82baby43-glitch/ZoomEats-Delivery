import { ComplianceGate } from "@/components/ComplianceGate";
import AdminTestingTools from "@/components/pages/AdminTestingTools";

export default function AdminTestingToolsPage() {
  return (
    <ComplianceGate roles={["admin", "super_admin"]}>
      <AdminTestingTools />
    </ComplianceGate>
  );
}
