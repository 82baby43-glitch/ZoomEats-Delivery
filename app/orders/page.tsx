import { ComplianceGate } from "@/components/ComplianceGate";
import MyOrders from "@/components/pages/MyOrders";

export default function OrdersPage() {
  return (
    <ComplianceGate roles={["customer"]} requireCompliance loginPath="/login">
      <MyOrders />
    </ComplianceGate>
  );
}
