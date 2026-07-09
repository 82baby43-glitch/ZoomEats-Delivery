import { ComplianceGate } from "@/components/ComplianceGate";
import Header from "@/components/Header";
import SystemHealthDashboard from "@/components/admin/SystemHealthDashboard";

export default function SystemHealthPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <SystemHealthDashboard />
      </div>
    </ComplianceGate>
  );
}
