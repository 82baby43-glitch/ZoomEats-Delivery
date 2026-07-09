"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

export default function PendingApproval() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!user) return;
    api.get("/auth/compliance-status").then((r) => setStatus(r?.data)).catch(() => {});
  }, [user]);

  const approval = status?.approval_status || "pending";

  return (
    <div>
      <Header />
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <h1 className="font-display text-3xl font-bold">Approval pending</h1>
        <p className="mt-4" style={{ color: "var(--muted)" }}>
          Your account status: <strong>{approval}</strong>
        </p>
        {approval === "documents_missing" && (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Additional documents are required. Check your email or contact support.
          </p>
        )}
        {approval === "rejected" && (
          <p className="mt-2 text-sm text-red-400">Your application was not approved.</p>
        )}
        {!status?.onboarding_complete && (
          <Link
            href={user?.role === "vendor" ? "/restaurant/onboarding" : "/driver/onboarding"}
            className="btn-primary inline-block mt-8"
          >
            Continue onboarding
          </Link>
        )}
        {status?.onboarding_complete && !status?.agreement_complete && (
          <Link href={user?.role === "vendor" ? "/restaurant/onboarding?step=4" : "/driver/onboarding?step=4"} className="btn-primary inline-block mt-8">
            Complete legal agreements
          </Link>
        )}
        <Link href="/onboarding" className="block mt-4 text-sm hover:underline" style={{ color: "var(--muted)" }}>
          Switch mode
        </Link>
      </div>
    </div>
  );
}
