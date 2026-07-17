import { Suspense } from "react";
import LoginPage from "@/components/pages/Login";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <LoginPage
        title="Sign in to ZoomEats"
        subtitle="One app for ordering, delivering, restaurants, and operations. Your dashboard opens automatically based on your account role."
        defaultRedirect="/"
      />
    </Suspense>
  );
}
