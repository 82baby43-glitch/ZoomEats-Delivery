import { Protected } from "@/components/Protected";
import Onboarding from "@/components/pages/Onboarding";

export default function OnboardingPage() {
  return (
    <Protected>
      <Onboarding />
    </Protected>
  );
}
