import { Protected } from "@/components/Protected";
import AgreementCenter from "@/components/pages/AgreementCenter";

export default function AgreementsPage() {
  return (
    <Protected>
      <AgreementCenter />
    </Protected>
  );
}
