import { redirect } from "next/navigation";

export default function AdminTestingToolsRedirectPage() {
  redirect("/admin/system-health?tab=testing");
}
