"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

const DASHBOARD_BY_ROLE = {
  delivery: "/driver/dashboard",
  driver: "/driver/dashboard",
  vendor: "/restaurant/dashboard",
  restaurant: "/restaurant/dashboard",
};

export default function PendingApproval() {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const r = await api.get("/auth/compliance-status");
        const next = r?.data;
        if (cancelled) return;
        setStatus(next);
        if (next?.can_access_dashboard) {
          const home = DASHBOARD_BY_ROLE[user.role] || "/";
          router.replace(home);
        }
      } catch {
        // keep polling
      }
    };

    refresh();
    const timer = setInterval(refresh, 5000);
    const onFocus = () => { refresh(); };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, router]);

  const approval = status?.approval_status || "pending";

  return (
    <div>
      <Header />
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <h1 className="font-display text-3xl font-bold">
          {approval === "approved" ? "You are approved!" : "Approval pending"}
        </h1>
        <p className="mt-4" style={{ color: "var(--muted)" }}>
          Your account status: <strong>{approval}</strong>
        </p>
        {approval === "approved" && (
          <p className="mt-2 text-sm text-green-400">Redirecting you to your dashboard…</p>
        )}
        {approval !== "approved" && (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            This page refreshes automatically. You will be sent to your dashboard as soon as an admin approves your account.
          </p>
        )}
        {approval === "documents_missing" && (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Additional documents are required. Check your email or contact support.
          </p>
        )}
        {approval === "rejected" && (
          <p className="mt-2 text-sm text-red-400">Your application was not approved.</p>
        )}
        {!status?.agreement_complete && approval !== "approved" && (
          <Link
            href={user?.role === "vendor" || user?.role === "restaurant" ? "/restaurant/onboarding" : "/agreements"}
            className="btn-primary inline-block mt-8"
          >
            Complete agreements &amp; forms
          </Link>
        )}
        <Link href="/onboarding" className="block mt-4 text-sm hover:underline" style={{ color: "var(--muted)" }}>
          Switch mode
        </Link>
      </div>
    </div>
  );
}
