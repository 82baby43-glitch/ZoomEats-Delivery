import type { SupabaseClient } from "@supabase/supabase-js";
import { agreementsForRole, agreementVersion, requiredAgreementTypes } from "./agreements";
import { normalizeRole } from "./authz";
import {
  getAppUrl,
  getResendApiKey,
  getResendFromEmail,
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioFromNumber,
} from "../server/notificationEnv";

export const NOTIFICATION_EVENTS = {
  AGREEMENT_UPDATE: "agreement_update",
  INSURANCE_EXPIRATION: "insurance_expiration",
  LICENSE_EXPIRATION: "license_expiration",
  DRIVER_APPROVED: "driver_approved",
  RESTAURANT_APPROVED: "restaurant_approved",
  BACKGROUND_CHECK_COMPLETE: "background_check_complete",
  MISSING_COMPLIANCE: "missing_compliance",
  PAYOUT_ISSUE: "payout_issue",
  PAYOUT_SETUP_REQUIRED: "payout_setup_required",
  PAYOUT_REVERIFICATION: "payout_reverification_required",
  PAYOUT_SETUP_COMPLETE: "payout_setup_complete",
} as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

export type DispatchNotificationInput = {
  userId: string;
  eventType: NotificationEventType | string;
  title: string;
  body: string;
  actionUrl?: string | null;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
  channels?: Array<"in_app" | "email" | "sms">;
};

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

type UserRow = { user_id: string; email?: string; name?: string; role?: string; phone?: string | null };

async function loadUser(db: SupabaseClient, userId: string): Promise<UserRow | null> {
  const { data } = await db.from("users").select("user_id,email,name,role,phone").eq("user_id", userId).maybeSingle();
  return data as UserRow | null;
}

async function loadPreferences(db: SupabaseClient, userId: string) {
  const { data } = await db.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  return {
    email_enabled: data?.email_enabled ?? true,
    sms_enabled: data?.sms_enabled ?? false,
    phone: (data?.phone as string) || null,
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = getResendApiKey();
  if (!apiKey || !to) return { ok: false, skipped: true, reason: "email_not_configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFromEmail(),
      to: [to],
      subject,
      html,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (payload as { message?: string }).message || "email_send_failed" };
  }
  return { ok: true, provider_id: (payload as { id?: string }).id || null };
}

async function sendSms(to: string, body: string) {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const from = getTwilioFromNumber();
  if (!sid || !token || !from || !to) return { ok: false, skipped: true, reason: "sms_not_configured" };

  const params = new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1500) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (payload as { message?: string }).message || "sms_send_failed" };
  }
  return { ok: true, provider_id: (payload as { sid?: string }).sid || null };
}

function renderEmailHtml(opts: { title: string; body: string; actionUrl?: string | null; name?: string }) {
  const appUrl = getAppUrl();
  const cta = opts.actionUrl
    ? `<p style="margin-top:24px"><a href="${opts.actionUrl}" style="background:#F5C518;color:#0A0A0A;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View in ZoomEats</a></p>`
    : `<p style="margin-top:24px"><a href="${appUrl}" style="color:#F5C518">Open ZoomEats</a></p>`;
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h1 style="font-size:20px;margin-bottom:8px">${opts.title}</h1>
      <p>Hi ${opts.name || "there"},</p>
      <p>${opts.body}</p>
      ${cta}
      <p style="margin-top:32px;font-size:12px;color:#666">ZoomEats Compliance Notifications</p>
    </div>
  `;
}

async function logDelivery(
  db: SupabaseClient,
  notificationId: string,
  channel: "email" | "sms" | "in_app",
  result: { ok: boolean; skipped?: boolean; error?: string; provider_id?: string | null; reason?: string }
) {
  await db.from("notification_deliveries").insert({
    delivery_id: uid("nd"),
    notification_id: notificationId,
    channel,
    status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
    provider: channel === "email" ? "resend" : channel === "sms" ? "twilio" : "internal",
    provider_id: result.provider_id || null,
    error: result.error || result.reason || null,
  });
}

export async function dispatchNotification(db: SupabaseClient, input: DispatchNotificationInput) {
  const channels = input.channels || ["in_app", "email", "sms"];
  const dedupeKey = input.dedupeKey || `${input.eventType}:${input.userId}`;

  if (dedupeKey) {
    const { data: existing } = await db
      .from("compliance_notifications")
      .select("notification_id")
      .eq("user_id", input.userId)
      .eq("dedupe_key", dedupeKey)
      .is("read_at", null)
      .limit(1)
      .maybeSingle();
    if (existing?.notification_id) {
      return { notification_id: existing.notification_id, deduped: true };
    }
  }

  const notificationId = uid("cn");
  const now = new Date().toISOString();
  await db.from("compliance_notifications").insert({
    notification_id: notificationId,
    user_id: input.userId,
    channel: "in_app",
    event_type: input.eventType,
    title: input.title,
    body: input.body,
    metadata: input.metadata || {},
    dedupe_key: dedupeKey,
    action_url: input.actionUrl || null,
    severity: input.severity || "info",
    created_at: now,
  });

  if (channels.includes("in_app")) {
    await logDelivery(db, notificationId, "in_app", { ok: true });
  }

  const user = await loadUser(db, input.userId);
  const prefs = await loadPreferences(db, input.userId);
  const phone = prefs.phone || user?.phone || null;
  const patch: Record<string, string> = {};

  if (channels.includes("email") && prefs.email_enabled && user?.email) {
    const emailResult = await sendEmail(
      user.email,
      input.title,
      renderEmailHtml({ title: input.title, body: input.body, actionUrl: input.actionUrl, name: user.name })
    );
    await logDelivery(db, notificationId, "email", emailResult);
    if (emailResult.ok) patch.email_sent_at = now;
  } else if (channels.includes("email")) {
    await logDelivery(db, notificationId, "email", { ok: false, skipped: true, reason: "email_disabled_or_missing" });
  }

  if (channels.includes("sms") && prefs.sms_enabled && phone) {
    const smsBody = `${input.title}: ${input.body}${input.actionUrl ? ` ${input.actionUrl}` : ""}`;
    const smsResult = await sendSms(phone, smsBody);
    await logDelivery(db, notificationId, "sms", smsResult);
    if (smsResult.ok) patch.sms_sent_at = now;
  } else if (channels.includes("sms")) {
    await logDelivery(db, notificationId, "sms", { ok: false, skipped: true, reason: "sms_disabled_or_missing_phone" });
  }

  if (Object.keys(patch).length) {
    await db.from("compliance_notifications").update(patch).eq("notification_id", notificationId);
  }

  return { notification_id: notificationId, deduped: false };
}

export async function notifyApproval(
  db: SupabaseClient,
  userId: string,
  role: string,
  action: string,
  notes?: string | null
) {
  if (action !== "approve") return;
  const appUrl = getAppUrl();
  if (role === "delivery") {
    await dispatchNotification(db, {
      userId,
      eventType: NOTIFICATION_EVENTS.DRIVER_APPROVED,
      title: "Driver account approved",
      body: notes || "Your driver account has been approved. You can now go online and accept deliveries.",
      actionUrl: `${appUrl}/driver/dashboard`,
      severity: "info",
      dedupeKey: `driver_approved:${userId}`,
    });
  }
  if (role === "vendor") {
    await dispatchNotification(db, {
      userId,
      eventType: NOTIFICATION_EVENTS.RESTAURANT_APPROVED,
      title: "Restaurant approved",
      body: notes || "Your restaurant has been approved on ZoomEats. Complete payout setup to start accepting orders.",
      actionUrl: `${appUrl}/restaurant/dashboard?tab=payouts`,
      severity: "info",
      dedupeKey: `restaurant_approved:${userId}`,
    });
  }
}

export async function notifyBackgroundCheck(
  db: SupabaseClient,
  userId: string,
  status: string,
  notes?: string | null
) {
  if (!["approved", "rejected"].includes(status)) return;
  const appUrl = getAppUrl();
  const passed = status === "approved";
  await dispatchNotification(db, {
    userId,
    eventType: NOTIFICATION_EVENTS.BACKGROUND_CHECK_COMPLETE,
    title: passed ? "Background check passed" : "Background check update",
    body: notes || (passed
      ? "Your background check has been completed and approved."
      : "Your background check requires review. Please contact support if you have questions."),
    actionUrl: passed ? `${appUrl}/driver/dashboard` : `${appUrl}/pending-approval`,
    severity: passed ? "info" : "warning",
    dedupeKey: `background_check:${userId}:${status}`,
  });
}

export async function notifyPayoutIssue(
  db: SupabaseClient,
  userId: string,
  opts: { requiresReverification: boolean; payoutReady: boolean }
) {
  const appUrl = getAppUrl();
  const user = await loadUser(db, userId);
  const role = normalizeRole(String(user?.role || ""));
  const dashboardPath = role === "delivery"
    ? "/driver/dashboard?tab=payouts"
    : "/restaurant/dashboard?tab=payouts";

  if (opts.requiresReverification) {
    await dispatchNotification(db, {
      userId,
      eventType: NOTIFICATION_EVENTS.PAYOUT_REVERIFICATION,
      title: "Payout reverification required",
      body: "Stripe needs updated identity or banking information before payouts can continue.",
      actionUrl: `${appUrl}${dashboardPath}`,
      severity: "critical",
      dedupeKey: `payout_reverify:${userId}`,
    });
    return;
  }
  if (opts.payoutReady) {
    await dispatchNotification(db, {
      userId,
      eventType: NOTIFICATION_EVENTS.PAYOUT_SETUP_COMPLETE,
      title: "Payout setup complete",
      body: "Your Stripe Connect account is ready to receive payouts.",
      actionUrl: `${appUrl}${dashboardPath}`,
      severity: "info",
      dedupeKey: `payout_complete:${userId}`,
    });
    return;
  }
  await dispatchNotification(db, {
    userId,
    eventType: NOTIFICATION_EVENTS.PAYOUT_SETUP_REQUIRED,
    title: "Complete payout setup",
    body: "Set up Stripe Connect to receive payouts and accept orders.",
    actionUrl: `${appUrl}${dashboardPath}`,
    severity: "warning",
    dedupeKey: `payout_required:${userId}`,
  });
}

export async function notifyMissingCompliance(
  db: SupabaseClient,
  userId: string,
  role: string,
  missing: string[]
) {
  if (!missing.length) return;
  const appUrl = getAppUrl();
  const path = role === "delivery" ? "/agreements" : role === "vendor" ? "/agreements" : "/customer/agreements";
  await dispatchNotification(db, {
    userId,
    eventType: NOTIFICATION_EVENTS.MISSING_COMPLIANCE,
    title: "Compliance action required",
    body: `You have ${missing.length} outstanding compliance item(s): ${missing.slice(0, 3).map((m) => m.replace(/_/g, " ")).join(", ")}${missing.length > 3 ? "…" : ""}.`,
    actionUrl: `${appUrl}${path}`,
    severity: "warning",
    metadata: { missing },
    dedupeKey: `missing_compliance:${userId}:${missing.sort().join(",")}`,
  });
}

export async function notifyAgreementUpdate(
  db: SupabaseClient,
  userId: string,
  role: string,
  outdated: Array<{ type: string; title: string; currentVersion: string; signedVersion: string }>
) {
  if (!outdated.length) return;
  const appUrl = getAppUrl();
  await dispatchNotification(db, {
    userId,
    eventType: NOTIFICATION_EVENTS.AGREEMENT_UPDATE,
    title: "Agreement update required",
    body: `Please review and re-sign updated agreement(s): ${outdated.map((o) => o.title).join(", ")}.`,
    actionUrl: `${appUrl}/agreements`,
    severity: "warning",
    metadata: { outdated },
    dedupeKey: `agreement_update:${userId}:${outdated.map((o) => `${o.type}:${o.currentVersion}`).join("|")}`,
  });
}

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function scanComplianceNotifications(db: SupabaseClient) {
  const appUrl = getAppUrl();
  const summary = {
    insurance_alerts: 0,
    license_alerts: 0,
    agreement_updates: 0,
    missing_compliance: 0,
    payout_issues: 0,
  };

  const { data: insuranceDocs } = await db
    .from("driver_documents")
    .select("user_id,document_type,expires_at")
    .in("document_type", ["insurance", "vehicle_insurance"])
    .not("expires_at", "is", null);

  for (const doc of insuranceDocs || []) {
    const days = daysUntil(String(doc.expires_at));
    if (days > 30 || days < -7) continue;
    const severity = days <= 0 ? "critical" : days <= 7 ? "warning" : "info";
    await dispatchNotification(db, {
      userId: String(doc.user_id),
      eventType: NOTIFICATION_EVENTS.INSURANCE_EXPIRATION,
      title: days <= 0 ? "Insurance expired" : `Insurance expires in ${days} day(s)`,
      body: days <= 0
        ? "Your insurance document has expired. Upload updated insurance to stay active."
        : "Your insurance document is expiring soon. Upload renewed coverage before it lapses.",
      actionUrl: `${appUrl}/driver/onboarding`,
      severity,
      dedupeKey: `insurance_exp:${doc.user_id}:${doc.expires_at}`,
    });
    summary.insurance_alerts += 1;
  }

  const { data: licenseDocs } = await db
    .from("driver_documents")
    .select("user_id,document_type,expires_at")
    .in("document_type", ["drivers_license", "license"])
    .not("expires_at", "is", null);

  for (const doc of licenseDocs || []) {
    const days = daysUntil(String(doc.expires_at));
    if (days > 30 || days < -7) continue;
    const severity = days <= 0 ? "critical" : days <= 7 ? "warning" : "info";
    await dispatchNotification(db, {
      userId: String(doc.user_id),
      eventType: NOTIFICATION_EVENTS.LICENSE_EXPIRATION,
      title: days <= 0 ? "License expired" : `License expires in ${days} day(s)`,
      body: days <= 0
        ? "Your driver's license has expired. Upload a current license to continue delivering."
        : "Your driver's license is expiring soon. Upload an updated license before it expires.",
      actionUrl: `${appUrl}/driver/onboarding`,
      severity,
      dedupeKey: `license_exp:${doc.user_id}:${doc.expires_at}`,
    });
    summary.license_alerts += 1;
  }

  const { data: onboardingRows } = await db
    .from("driver_onboarding")
    .select("user_id,license_expiration")
    .not("license_expiration", "is", null);

  for (const row of onboardingRows || []) {
    const days = daysUntil(String(row.license_expiration));
    if (days > 30 || days < -7) continue;
    await dispatchNotification(db, {
      userId: String(row.user_id),
      eventType: NOTIFICATION_EVENTS.LICENSE_EXPIRATION,
      title: days <= 0 ? "License expiration overdue" : `License expires in ${days} day(s)`,
      body: "Update your license information in driver onboarding.",
      actionUrl: `${appUrl}/driver/onboarding`,
      severity: days <= 0 ? "critical" : "warning",
      dedupeKey: `license_onboarding:${row.user_id}:${row.license_expiration}`,
    });
    summary.license_alerts += 1;
  }

  const { data: partners } = await db
    .from("users")
    .select("user_id,role,approval_status,agreement_complete")
    .in("role", ["delivery", "vendor"]);

  for (const partner of partners || []) {
    const role = normalizeRole(String(partner.role));
    const { data: acceptances } = await db
      .from("agreement_acceptances")
      .select("agreement_type,agreement_version")
      .eq("user_id", partner.user_id);
    const signed = new Map((acceptances || []).map((a) => [a.agreement_type, a.agreement_version]));
    const outdated = agreementsForRole(role)
      .filter((def) => def.required)
      .map((def) => {
        const currentVersion = agreementVersion(def);
        const signedVersion = signed.get(def.type);
        if (!signedVersion || signedVersion !== currentVersion) {
          return { type: def.type, title: def.title, currentVersion, signedVersion: signedVersion || "none" };
        }
        return null;
      })
      .filter(Boolean) as Array<{ type: string; title: string; currentVersion: string; signedVersion: string }>;

    if (outdated.length) {
      await notifyAgreementUpdate(db, String(partner.user_id), role, outdated);
      summary.agreement_updates += 1;
    }

    const missing = requiredAgreementTypes(role).filter((t) => !signed.has(t));
    if (missing.length && partner.approval_status !== "rejected") {
      await notifyMissingCompliance(db, String(partner.user_id), role, missing);
      summary.missing_compliance += 1;
    }
  }

  const { data: payoutAccounts } = await db
    .from("stripe_connect_accounts")
    .select("user_id,requires_reverification,payouts_enabled,charges_enabled,details_submitted")
    .or("requires_reverification.eq.true,payouts_enabled.eq.false");

  for (const acct of payoutAccounts || []) {
    const payoutReady = Boolean(acct.charges_enabled && acct.payouts_enabled && acct.details_submitted && !acct.requires_reverification);
    if (!payoutReady) {
      await notifyPayoutIssue(db, String(acct.user_id), {
        requiresReverification: Boolean(acct.requires_reverification),
        payoutReady: false,
      });
      summary.payout_issues += 1;
    }
  }

  return summary;
}
