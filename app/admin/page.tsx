import { Protected } from "@/components/Protected";
import AdminPanel from "@/components/pages/AdminPanel";

export default function AdminPage() {
  return (
    <Protected roles={["admin"]}>
      <AdminPanel />
    </Protected>
  );
}
