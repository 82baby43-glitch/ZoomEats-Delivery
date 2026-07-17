import AdminRestaurantPartners from "@/components/pages/AdminRestaurantPartners";
import { ComplianceGate } from "@/components/ComplianceGate";

export default function Page() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <AdminRestaurantPartners />
    </ComplianceGate>
  );
}
