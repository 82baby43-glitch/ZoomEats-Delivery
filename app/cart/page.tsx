import Cart from "@/components/pages/Cart";
import { ComplianceGate } from "@/components/ComplianceGate";

export default function CartPage() {
  return (
    <ComplianceGate roles={["customer"]} requireCompliance loginPath="/login">
      <Cart />
    </ComplianceGate>
  );
}
