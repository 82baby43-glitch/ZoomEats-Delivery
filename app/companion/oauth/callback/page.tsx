import { Suspense } from "react";
import CompanionOAuthCallback from "@/components/companion/CompanionOAuthCallback";

export default function CompanionOAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Connecting…</div>}>
      <CompanionOAuthCallback />
    </Suspense>
  );
}
