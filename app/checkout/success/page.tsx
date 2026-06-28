import { Protected } from "@/components/Protected";
import CheckoutSuccess from "@/components/pages/CheckoutSuccess";

export default function CheckoutSuccessPage() {
  return (
    <Protected>
      <CheckoutSuccess />
    </Protected>
  );
}
