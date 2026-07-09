"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import ComplianceAgreementWizard from "@/components/compliance/ComplianceAgreementWizard";

export default function RoleAgreementCenter({ roleLabel }) {
  const { user, refresh } = useAuth();
  const router = useRouter();

  const handleComplete = async () => {
    await refresh();
    const statusRes = await api.get("/auth/compliance-status");
    const status = statusRes?.data;
    if (status?.can_access_dashboard) {
      router.replace(user?.role === "vendor" || user?.role === "restaurant" ? "/restaurant/dashboard" : "/driver/dashboard");
    } else {
      router.replace("/pending-approval");
    }
  };

  const label = roleLabel === "Platform"
    ? (user?.role === "vendor" || user?.role === "restaurant" ? "Restaurant" : "Driver")
    : roleLabel;

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold">{label} Agreement Center</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          Complete your application, background authorization (drivers), and electronically sign all required agreements.
        </p>
        <div className="mt-8">
          <ComplianceAgreementWizard roleLabel={label} onAllComplete={handleComplete} />
        </div>
      </div>
    </div>
  );
}
