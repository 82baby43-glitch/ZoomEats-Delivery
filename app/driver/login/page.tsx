import { Suspense } from "react";
import LoginPage from "@/components/pages/Login";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <LoginPage
        title="Driver sign in"
        subtitle="Access your driver dashboard, go online, and accept deliveries."
        defaultRedirect="/driver/dashboard"
      />
    </Suspense>
  );
}
