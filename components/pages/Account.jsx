"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Repeat, User as UserIcon } from "lucide-react";
import Header from "@/components/Header";
import InstallAppCard from "@/components/account/AddToHomeScreenCard";
import { useAuth } from "@/lib/auth";
import { getClientAppType, getPwaConfig } from "@/lib/pwa/appContext";
import { normalizeRole } from "@/lib/compliance/authz";

const ROLE_LABELS = {
  customer: "Customer",
  delivery: "Driver",
  vendor: "Restaurant",
  admin: "Admin",
  dispatcher: "Dispatcher",
};

export default function AccountPage() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const appType = getClientAppType();
  const config = getPwaConfig(appType);
  const loginPath = config.loginPath;

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`${loginPath}?redirect=${encodeURIComponent("/account")}`);
    }
  }, [loading, user, router, loginPath]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: "var(--primary)" }}
        />
      </div>
    );
  }

  const role = normalizeRole(user.role);
  const roleLabel = ROLE_LABELS[role] || user.role;

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      <Header />
      <div className="max-w-lg mx-auto px-6 py-8 space-y-6" data-testid="account-page">
        <div>
          <h1 className="font-display text-3xl font-bold">Account</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Manage your ZoomEats profile and app settings.
          </p>
        </div>

        <div className="card p-5 flex items-center gap-4">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--surface-2)" }}
            >
              <UserIcon size={28} />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-lg truncate">{user.name}</div>
            <div className="text-sm truncate" style={{ color: "var(--muted)" }}>{user.email}</div>
            <span className="badge mt-2 inline-block">{roleLabel}</span>
          </div>
        </div>

        <InstallAppCard />

        <div className="card overflow-hidden">
          <button
            type="button"
            className="w-full text-left px-4 py-4 flex items-center gap-3 text-sm border-b hover:bg-black/30"
            style={{ borderColor: "var(--border)" }}
            onClick={() => router.push("/onboarding")}
            data-testid="account-switch-mode"
          >
            <Repeat size={18} /> Switch mode
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-4 flex items-center gap-3 text-sm hover:bg-black/30 text-red-400"
            onClick={logout}
            data-testid="account-sign-out"
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
