"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ComplianceGate } from "@/components/ComplianceGate";
import RoleAgreementCenter from "@/components/pages/RoleAgreementCenter";
import { useAuth } from "@/lib/auth";

export default function AgreementsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (user.role === "vendor" || user.role === "restaurant") {
      router.replace("/signup/merchant");
    }
  }, [user, router]);

  if (user?.role === "vendor" || user?.role === "restaurant") {
    return null;
  }

  return (
    <ComplianceGate roles={["delivery", "driver", "vendor", "restaurant"]} requireCompliance={false} loginPath="/login">
      <RoleAgreementCenter roleLabel="Platform" />
    </ComplianceGate>
  );
}
