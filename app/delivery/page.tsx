import { Protected } from "@/components/Protected";
import DeliveryDashboard from "@/components/pages/DeliveryDashboard";

export default function DeliveryPage() {
  return (
    <Protected roles={["delivery"]}>
      <DeliveryDashboard />
    </Protected>
  );
}
