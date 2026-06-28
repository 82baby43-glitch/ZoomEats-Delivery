import { Protected } from "@/components/Protected";
import AdminCompliance from "@/components/pages/AdminCompliance";

export default function AdminCompliancePage() {
  return (
    <Protected roles={["admin"]}>
      <AdminCompliance />
    </Protected>
  );
}
