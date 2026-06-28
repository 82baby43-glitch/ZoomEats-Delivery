"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function Protected({ children, roles = null }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading) {
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
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <div className="font-display text-2xl font-bold">Not authorized</div>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            This page requires a different role.
          </p>
        </div>
      </div>
    );
  }
  return children;
}
