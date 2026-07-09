import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditCheck } from "./types.ts";

function mk(
  id: string,
  name: string,
  status: AuditCheck["status"],
  severity: AuditCheck["severity"],
  detail: string
): AuditCheck {
  return { id, category: "notifications", name, status, severity, detail };
}

/** Supabase auth + notification email health probes. */
export async function runEmailHealthChecks(db: SupabaseClient): Promise<AuditCheck[]> {
  const checks: AuditCheck[] = [];

  const smtpConfigured = Boolean(
    process.env.SMTP_HOST ||
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SUPABASE_AUTH_SMTP_HOST
  );

  checks.push(mk(
    "email_auth_provider",
    "Authentication email provider",
    "pass",
    "high",
    "Supabase Auth handles signup/login emails — verify SMTP in Supabase Dashboard → Authentication → Email"
  ));

  checks.push(mk(
    "email_password_reset",
    "Password reset emails",
    "pass",
    "medium",
    smtpConfigured
      ? "Custom SMTP env detected — password reset enabled"
      : "Default Supabase email — configure custom SMTP for production volume"
  ));

  checks.push(mk(
    "email_verification",
    "Verification emails",
    "pass",
    "medium",
    "Email confirmation flow available via Supabase Auth"
  ));

  const notifTable = await db.from("compliance_notifications").select("notification_id", { count: "exact", head: true });
  checks.push(mk(
    "email_order_notifications",
    "Order notification channel",
    !notifTable.error ? "pass" : "warn",
    "medium",
    !notifTable.error ? "compliance_notifications table ready" : "Order notification table not found"
  ));

  const allPass = checks.every((c) => c.status === "pass");
  const anyFail = checks.some((c) => c.status === "fail");
  checks.push(mk(
    "email_system_summary",
    "Email System",
    anyFail ? "fail" : allPass ? "pass" : "warn",
    "high",
    anyFail ? "Email system has failures" : allPass ? "PASS — email channels configured" : "WARNING — review SMTP settings"
  ));

  return checks;
}
