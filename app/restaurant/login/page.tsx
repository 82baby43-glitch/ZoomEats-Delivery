import { Suspense } from "react";
import LoginPage from "@/components/pages/Login";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <LoginPage
        title="Restaurant sign in"
        subtitle="Manage your menu, orders, and store settings."
        defaultRedirect="/restaurant/dashboard"
      />
    </Suspense>
  );
}
