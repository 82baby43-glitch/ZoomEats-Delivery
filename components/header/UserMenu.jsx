"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User as UserIcon, LogOut, Repeat, Smartphone } from "lucide-react";
import { signInWithGoogle } from "@/lib/auth";
import { isMobileDevice, isStandaloneMode } from "@/lib/pwa/appContext";

const startLogin = () => {
  signInWithGoogle().catch((e) => console.error("[auth] login failed:", e));
};

export default function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const showHomeScreenHint = typeof window !== "undefined" && isMobileDevice() && !isStandaloneMode();

  if (!user) {
    return (
      <button className="btn-primary login-header-btn" onClick={startLogin} data-testid="login-button">
        Sign in
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 btn-ghost"
        onClick={() => setOpen((v) => !v)}
        data-testid="user-menu-button"
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <UserIcon size={20} />
        )}
        <span className="hidden md:block font-bold">{user.name?.split(" ")[0]}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-56 border rounded-xl shadow-lg overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          data-testid="user-menu"
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm font-bold">{user.name}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{user.email}</div>
            <div className="text-xs mt-1 label-eyebrow">Role: {user.role}</div>
          </div>
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
            onClick={() => { setOpen(false); router.push("/account"); }}
            data-testid="account-menu-link"
          >
            <UserIcon size={16} /> Account
          </button>
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
            onClick={() => { setOpen(false); router.push("/onboarding"); }}
            data-testid="switch-mode-button"
          >
            <Repeat size={16} /> Switch mode
          </button>
          {showHomeScreenHint && (
            <button
              className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
              onClick={() => { setOpen(false); router.push("/account"); }}
              data-testid="install-app-button"
            >
              <Smartphone size={16} /> Add to Home Screen
            </button>
          )}
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
            onClick={logout}
            data-testid="logout-button"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
