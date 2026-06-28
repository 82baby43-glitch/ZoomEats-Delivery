import { Protected } from "@/components/Protected";
import VendorDashboard from "@/components/pages/VendorDashboard";

export default function VendorPage() {
  return (
    <Protected roles={["vendor"]}>
      <VendorDashboard />
    </Protected>
  );
}
