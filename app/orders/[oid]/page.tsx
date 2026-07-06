import { ComplianceGate } from "@/components/ComplianceGate";
import OrderDetail from "@/components/pages/OrderDetail";

export default function OrderDetailPage() {
  return (
    <ComplianceGate roles={["customer"]} requireCompliance loginPath="/login">
      <OrderDetail />
    </ComplianceGate>
  );
}
