"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getRoleGuardRedirect, isPublicPath } from "@/lib/auth/roleRouting";

/**
 * Database-role routing guard — redirects users to the correct dashboard
 * when they hit a route their role cannot access. No subdomain logic.
 */
export default function RoleRouter() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user || isPublicPath(pathname)) return;

    const target = getRoleGuardRedirect(user, pathname);
    if (target && target !== pathname) {
      window.location.replace(target);
    }
  }, [user, loading, pathname]);

  return null;
}
