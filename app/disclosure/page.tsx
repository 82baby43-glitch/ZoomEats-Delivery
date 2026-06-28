import { Protected } from "@/components/Protected";
import DisclosureForm from "@/components/pages/DisclosureForm";

export default function DisclosurePage() {
  return (
    <Protected roles={["delivery"]}>
      <DisclosureForm />
    </Protected>
  );
}
