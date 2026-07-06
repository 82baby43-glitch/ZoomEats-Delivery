"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { roleMatches } from "@/lib/compliance/authz";

const ERROR_MESSAGES = {
  session_expired: "Your session has expired. Please sign in again.",
  unauthorized: "You are not authorized to view this page.",
  agreement_required: "Please complete required agreements to continue.",
  approval_pending: "Your account is pending approval.",
  account_suspended: "Your account has been suspended.",
  auth_failed: "Sign in failed. Please try again.",
};

function parseErrorParam() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("error");
  return code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : null;
}

export function ComplianceGate({
  children,
  roles = null,
  requireCompliance = true,
  loginPath = "/login",
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [compliance, setCompliance] = useState(null);
  const [checking, setChecking] = useState(requireCompliance);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    setErrorMsg(parseErrorParam());
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      const redirect = encodeURIComponent(window.location.pathname);
      router.replace(`${loginPath}?redirect=${redirect}`);
    }
  }, [loading, user, router, loginPath]);

  useEffect(() => {
    if (!user || !requireCompliance) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/auth/compliance-status");
        const status = res?.data;
        if (!cancelled) {
          setCompliance(status);
          if (status?.redirect_to && roles?.length) {
            router.replace(status.redirect_to);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const status = e?.status;
          if (status === 401) {
            router.replace(`${loginPath}?error=session_expired`);
          }
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, requireCompliance, roles, router, loginPath]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: "var(--primary)" }}
        />
      </div>
    );
  }

  if (!user) return null;

  if (roles && !roleMatches(user.role, roles)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <div className="font-display text-2xl font-bold">Unauthorized</div>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            This page requires a different role. Your role: {user.role}
          </p>
        </div>
      </div>
    );
  }

  if (requireCompliance && compliance && !compliance.can_access_dashboard && roles?.length) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <div className="font-display text-2xl font-bold">{compliance.message || "Action required"}</div>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            {compliance.redirect_to ? `Redirecting to ${compliance.redirect_to}…` : "Please complete onboarding."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {errorMsg && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm text-center py-2 px-4">
          {errorMsg}
        </div>
      )}
      {children}
    </>
  );
}

/** @deprecated Use ComplianceGate */
export function Protected({ children, roles = null }) {
  return (
    <ComplianceGate roles={roles} requireCompliance={Boolean(roles?.length)}>
      {children}
    </ComplianceGate>
  );
}
