"use client";

import { useSearchParams } from "next/navigation";
import SystemHealthDashboard from "@/components/admin/SystemHealthDashboard";

const VALID_TABS = new Set([
  "readiness",
  "events",
  "status",
  "failed",
  "performance",
  "security",
  "report",
  "testing",
]);

export default function SystemHealthClient() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") || "readiness";
  const initialTab = VALID_TABS.has(tabParam) ? tabParam : "readiness";

  return <SystemHealthDashboard initialTab={initialTab} />;
}
