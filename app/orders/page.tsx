import { Protected } from "@/components/Protected";
import MyOrders from "@/components/pages/MyOrders";

export default function OrdersPage() {
  return (
    <Protected>
      <MyOrders />
    </Protected>
  );
}
