import { Protected } from "@/components/Protected";
import OrderDetail from "@/components/pages/OrderDetail";

export default function OrderDetailPage() {
  return (
    <Protected>
      <OrderDetail />
    </Protected>
  );
}
