import { ComplianceGate } from "@/components/ComplianceGate";
import AdminHero from "@/components/pages/AdminHero";

export default function AdminHeroPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminHero />
    </ComplianceGate>
  );
}
