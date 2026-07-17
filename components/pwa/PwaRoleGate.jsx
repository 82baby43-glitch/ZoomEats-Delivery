"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  isPublicAuthPath,
  redirectUrlForUser,
  userMatchesAppContext,
} from "@/lib/pwa/roleAccess";

/**
 * Keeps each account on the correct PWA context — customers on customer,
 * drivers on driver, restaurants on restaurant, admins on admin.
 */
export default function PwaRoleGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user || isPublicAuthPath(pathname)) return;

    const host = window.location.host;
    if (userMatchesAppContext(user, host, pathname)) return;

    const target = redirectUrlForUser(user);
    if (target && target !== window.location.href) {
      window.location.replace(target);
    }
  }, [user, loading, pathname]);

  return null;
}
