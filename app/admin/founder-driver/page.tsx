import FounderDriverDashboard from "@/components/pages/FounderDriverDashboard";
import { ComplianceGate } from "@/components/ComplianceGate";
import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import CompanionAudioSync from "@/components/companion/CompanionAudioSync";

export default function FounderDriverPage() {
  return (
    <ComplianceGate roles={["admin", "founder_driver", "super_admin"]} alsoAllowFounderDriver requireCompliance={false}>
      <CompanionModeProvider>
        <CompanionAudioSync />
        <FounderDriverDashboard />
      </CompanionModeProvider>
    </ComplianceGate>
  );
}
