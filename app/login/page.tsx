import { Suspense } from "react";
import LoginPage from "@/components/pages/Login";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <LoginPage
        title="Sign in to ZoomEats"
        subtitle="Order food, run a kitchen, or deliver on your schedule."
        defaultRedirect="/onboarding"
      />
    </Suspense>
  );
}
