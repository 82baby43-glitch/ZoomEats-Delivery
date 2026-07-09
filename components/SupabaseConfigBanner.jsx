"use client";

import { useEffect, useState } from "react";
import { isSupabasePublicConfigured, SUPABASE_CONFIG_ERROR } from "@/lib/supabaseEnv";
import { checkSupabaseConnection } from "@/lib/supabaseClient";

export default function SupabaseConfigBanner() {
  const [issue, setIssue] = useState(null);

  useEffect(() => {
    if (!isSupabasePublicConfigured()) {
      setIssue(SUPABASE_CONFIG_ERROR);
      return;
    }
    checkSupabaseConnection().then((r) => {
      if (!r.ok && r.step === "config") setIssue(SUPABASE_CONFIG_ERROR);
      else if (!r.ok) setIssue("Supabase connection failed. Check environment configuration.");
    }).catch(() => setIssue("Supabase connection failed. Check environment configuration."));
  }, []);

  if (!issue) return null;

  return (
    <div
      className="px-4 py-3 text-sm text-center font-medium"
      style={{ background: "rgba(248,113,113,0.15)", color: "#fca5a5", borderBottom: "1px solid rgba(248,113,113,0.3)" }}
      role="alert"
    >
      {issue}
    </div>
  );
}
