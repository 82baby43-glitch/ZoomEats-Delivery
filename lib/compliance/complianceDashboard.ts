import type { SupabaseClient } from "@supabase/supabase-js";
import { agreementsForRole, agreementVersion, requiredAgreementTypes } from "./agreements";
import { normalizeRole } from "./authz";

export type CompliancePartnerRow = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  entity_id: string | null;
  entity_name: string | null;
  approval_status: string;
  agreement_complete: boolean;
  missing_agreements: string[];
  expired_licenses: number;
  expired_insurance: number;
  expiring_licenses: number;
  expiring_insurance: number;
  background_check_status: string | null;
  documents_complete: boolean;
  stripe_connect_complete: boolean;
  payout_ready: boolean;
  compliance_score: number;
  issues: string[];
  updated_at: string | null;
};

export type ComplianceOverviewStats = {
  compliance_percentage: number;
  total_partners: number;
  compliant_partners: number;
  missing_agreements: number;
  expired_licenses: number;
  expired_insurance: number;
  pending_approvals: number;
  pending_background_checks: number;
  drivers_total: number;
  drivers_approved: number;
  drivers_pending: number;
  restaurants_total: number;
  restaurants_approved: number;
  restaurants_pending: number;
  total_signatures: number;
};

export type ComplianceOverview = {
  stats: ComplianceOverviewStats;
  drivers: CompliancePartnerRow[];
  restaurants: CompliancePartnerRow[];
  generated_at: string;
};

const LICENSE_TYPES = new Set(["drivers_license", "license"]);
const INSURANCE_TYPES = new Set(["insurance", "vehicle_insurance"]);

function isExpired(dateStr: string | null | undefined) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function isExpiringSoon(dateStr: string | null | undefined, days = 30) {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function scorePartner(issues: string[]) {
  if (!issues.length) return 100;
  const penalty = Math.min(issues.length * 15, 85);
  return Math.max(15, 100 - penalty);
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildComplianceOverview(db: SupabaseClient): Promise<ComplianceOverview> {
  const [
    { data: users },
    { data: drivers },
    { data: restaurants },
    { data: acceptances },
    { data: driverDocs },
    { data: bgChecks },
    { data: connectAccounts },
    { data: onboardingRows },
  ] = await Promise.all([
    db.from("users").select("user_id,name,email,role,approval_status,agreement_complete,updated_at").in("role", ["delivery", "vendor"]),
    db.from("drivers").select("*"),
    db.from("restaurants").select("*"),
    db.from("agreement_acceptances").select("user_id,agreement_type,agreement_version"),
    db.from("driver_documents").select("user_id,document_type,expires_at,status"),
    db.from("background_checks").select("user_id,status,completed_at,initiated_at"),
    db.from("stripe_connect_accounts").select("user_id,charges_enabled,payouts_enabled,details_submitted,requires_reverification"),
    db.from("driver_onboarding").select("user_id,license_expiration"),
  ]);

  const acceptancesByUser = new Map<string, Array<{ agreement_type: string; agreement_version: string }>>();
  for (const a of acceptances || []) {
    const list = acceptancesByUser.get(a.user_id as string) || [];
    list.push({ agreement_type: a.agreement_type as string, agreement_version: a.agreement_version as string });
    acceptancesByUser.set(a.user_id as string, list);
  }

  const docsByUser = new Map<string, typeof driverDocs>();
  for (const d of driverDocs || []) {
    const list = docsByUser.get(d.user_id as string) || [];
    list.push(d);
    docsByUser.set(d.user_id as string, list);
  }

  const bgByUser = new Map<string, { status: string }>();
  for (const b of bgChecks || []) {
    const uid = b.user_id as string;
    if (!bgByUser.has(uid)) bgByUser.set(uid, { status: b.status as string });
  }

  const connectByUser = new Map<string, { payout_ready: boolean }>();
  for (const c of connectAccounts || []) {
    connectByUser.set(c.user_id as string, {
      payout_ready: Boolean(c.charges_enabled && c.payouts_enabled && c.details_submitted && !c.requires_reverification),
    });
  }

  const licenseExpByUser = new Map<string, string>();
  for (const row of onboardingRows || []) {
    if (row.license_expiration) licenseExpByUser.set(row.user_id as string, String(row.license_expiration));
  }

  const driverMap = new Map((drivers || []).map((d) => [d.user_id, d]));
  const restaurantsByOwner = new Map<string, typeof restaurants>();
  for (const r of restaurants || []) {
    const owner = r.owner_id as string;
    const list = restaurantsByOwner.get(owner) || [];
    list.push(r);
    restaurantsByOwner.set(owner, list);
  }

  const driverRows: CompliancePartnerRow[] = [];
  const restaurantRows: CompliancePartnerRow[] = [];

  for (const user of users || []) {
    const role = normalizeRole(String(user.role));
    const userAcceptances = acceptancesByUser.get(user.user_id as string) || [];
    const signedTypes = new Set(userAcceptances.map((a) => a.agreement_type));
    const missing = requiredAgreementTypes(role).filter((t) => !signedTypes.has(t));

    const outdated = agreementsForRole(role)
      .filter((def) => def.required)
      .filter((def) => {
        const signed = userAcceptances.find((a) => a.agreement_type === def.type);
        return signed && signed.agreement_version !== agreementVersion(def);
      })
      .map((def) => def.type);

    const allMissing = [...new Set([...missing, ...outdated])];
    const docs = docsByUser.get(user.user_id as string) || [];
    let expiredLicenses = 0;
    let expiredInsurance = 0;
    let expiringLicenses = 0;
    let expiringInsurance = 0;

    for (const doc of docs) {
      const type = String(doc.document_type || "");
      if (LICENSE_TYPES.has(type)) {
        if (isExpired(doc.expires_at as string)) expiredLicenses += 1;
        else if (isExpiringSoon(doc.expires_at as string)) expiringLicenses += 1;
      }
      if (INSURANCE_TYPES.has(type)) {
        if (isExpired(doc.expires_at as string)) expiredInsurance += 1;
        else if (isExpiringSoon(doc.expires_at as string)) expiringInsurance += 1;
      }
    }

    const onboardingLicense = licenseExpByUser.get(user.user_id as string);
    if (onboardingLicense) {
      if (isExpired(onboardingLicense)) expiredLicenses += 1;
      else if (isExpiringSoon(onboardingLicense)) expiringLicenses += 1;
    }

    const bg = bgByUser.get(user.user_id as string);
    const connect = connectByUser.get(user.user_id as string);
    const issues: string[] = [];

    if (!user.agreement_complete || allMissing.length) issues.push("missing_agreements");
    if (expiredLicenses) issues.push("expired_license");
    if (expiredInsurance) issues.push("expired_insurance");
    if (expiringLicenses) issues.push("expiring_license");
    if (expiringInsurance) issues.push("expiring_insurance");
    if (["pending", "review", "verification", "documents_missing"].includes(String(user.approval_status))) {
      issues.push("pending_approval");
    }
    if (bg?.status === "pending") issues.push("pending_background_check");
    if (connect && !connect.payout_ready) issues.push("payout_incomplete");

    const base: CompliancePartnerRow = {
      user_id: user.user_id as string,
      name: (user.name as string) || "—",
      email: (user.email as string) || "—",
      role,
      entity_id: null,
      entity_name: null,
      approval_status: (user.approval_status as string) || "pending",
      agreement_complete: Boolean(user.agreement_complete),
      missing_agreements: allMissing,
      expired_licenses: expiredLicenses,
      expired_insurance: expiredInsurance,
      expiring_licenses: expiringLicenses,
      expiring_insurance: expiringInsurance,
      background_check_status: bg?.status || null,
      documents_complete: false,
      stripe_connect_complete: false,
      payout_ready: connect?.payout_ready ?? false,
      compliance_score: scorePartner(issues),
      issues,
      updated_at: (user.updated_at as string) || null,
    };

    if (role === "delivery") {
      const driver = driverMap.get(user.user_id as string);
      driverRows.push({
        ...base,
        entity_id: (driver?.driver_id as string) || null,
        entity_name: (driver?.name as string) || base.name,
        approval_status: (driver?.approval_status as string) || base.approval_status,
        agreement_complete: driver?.agreement_complete ?? base.agreement_complete,
        documents_complete: Boolean(driver?.documents_complete),
        stripe_connect_complete: Boolean(driver?.stripe_connect_complete),
        payout_ready: connect?.payout_ready ?? Boolean(driver?.stripe_connect_complete && driver?.payouts_enabled),
        updated_at: (driver?.updated_at as string) || base.updated_at,
      });
    }

    if (role === "vendor") {
      const rests = restaurantsByOwner.get(user.user_id as string) || [];
      const rest = rests[0];
      restaurantRows.push({
        ...base,
        entity_id: (rest?.restaurant_id as string) || null,
        entity_name: (rest?.name as string) || base.name,
        approval_status: (rest?.approval_status as string) || base.approval_status,
        agreement_complete: rest?.agreement_complete ?? base.agreement_complete,
        stripe_connect_complete: Boolean(rest?.stripe_connect_complete),
        payout_ready: connect?.payout_ready ?? Boolean(rest?.stripe_connect_complete && rest?.payouts_enabled),
        updated_at: (rest?.updated_at as string) || base.updated_at,
      });
    }
  }

  const allRows = [...driverRows, ...restaurantRows];
  const compliant = allRows.filter((r) => r.compliance_score >= 100 && !r.issues.length).length;
  const stats: ComplianceOverviewStats = {
    compliance_percentage: allRows.length ? Math.round(allRows.reduce((s, r) => s + r.compliance_score, 0) / allRows.length) : 100,
    total_partners: allRows.length,
    compliant_partners: compliant,
    missing_agreements: allRows.filter((r) => r.missing_agreements.length > 0).length,
    expired_licenses: allRows.reduce((s, r) => s + r.expired_licenses, 0),
    expired_insurance: allRows.reduce((s, r) => s + r.expired_insurance, 0),
    pending_approvals: allRows.filter((r) => r.issues.includes("pending_approval")).length,
    pending_background_checks: allRows.filter((r) => r.background_check_status === "pending").length,
    drivers_total: driverRows.length,
    drivers_approved: driverRows.filter((r) => r.approval_status === "approved").length,
    drivers_pending: driverRows.filter((r) => r.approval_status !== "approved").length,
    restaurants_total: restaurantRows.length,
    restaurants_approved: restaurantRows.filter((r) => r.approval_status === "approved").length,
    restaurants_pending: restaurantRows.filter((r) => r.approval_status !== "approved").length,
    total_signatures: acceptances?.length || 0,
  };

  return {
    stats,
    drivers: driverRows,
    restaurants: restaurantRows,
    generated_at: new Date().toISOString(),
  };
}

export type ComplianceFilterOpts = {
  q?: string;
  role?: string;
  status?: string;
  issue?: string;
};

export function filterComplianceRows(rows: CompliancePartnerRow[], opts: ComplianceFilterOpts) {
  let result = rows;
  const q = (opts.q || "").trim().toLowerCase();
  if (q) {
    result = result.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.entity_name || "").toLowerCase().includes(q)
    );
  }
  if (opts.role && opts.role !== "all") {
    result = result.filter((r) => r.role === normalizeRole(opts.role));
  }
  if (opts.status === "approved") {
    result = result.filter((r) => r.approval_status === "approved");
  } else if (opts.status === "pending") {
    result = result.filter((r) => r.approval_status !== "approved");
  } else if (opts.status === "issues") {
    result = result.filter((r) => r.issues.length > 0);
  }
  if (opts.issue && opts.issue !== "all") {
    const map: Record<string, (r: CompliancePartnerRow) => boolean> = {
      missing_agreements: (r) => r.missing_agreements.length > 0,
      expired_license: (r) => r.expired_licenses > 0,
      expired_insurance: (r) => r.expired_insurance > 0,
      pending_bg: (r) => r.background_check_status === "pending",
      payout: (r) => r.issues.includes("payout_incomplete"),
      pending_approval: (r) => r.issues.includes("pending_approval"),
    };
    const fn = map[opts.issue];
    if (fn) result = result.filter(fn);
  }
  return result;
}

export function complianceOverviewToCsv(overview: ComplianceOverview, rows: CompliancePartnerRow[]) {
  const headers = [
    "Role", "Name", "Email", "Entity", "Approval Status", "Compliance Score",
    "Missing Agreements", "Expired Licenses", "Expired Insurance",
    "Background Check", "Payout Ready", "Issues",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.role,
      csvEscape(r.name),
      csvEscape(r.email),
      csvEscape(r.entity_name),
      r.approval_status,
      r.compliance_score,
      csvEscape(r.missing_agreements.join("; ")),
      r.expired_licenses,
      r.expired_insurance,
      r.background_check_status || "—",
      r.payout_ready ? "yes" : "no",
      csvEscape(r.issues.join("; ")),
    ].join(","));
  }
  lines.push("");
  lines.push(`Generated,${overview.generated_at}`);
  lines.push(`Compliance %,${overview.stats.compliance_percentage}`);
  return lines.join("\n");
}

export async function fetchComplianceAudit(
  db: SupabaseClient,
  opts: { limit?: number; offset?: number; event_type?: string; user_id?: string }
) {
  let q = db
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(opts.offset || 0, (opts.offset || 0) + (opts.limit || 50) - 1);

  if (opts.event_type) q = q.eq("event_type", opts.event_type);
  if (opts.user_id) q = q.eq("user_id", opts.user_id);

  const { data } = await q;
  const actorIds = [...new Set((data || []).map((l) => l.actor_id).filter(Boolean))];
  const userIds = [...new Set((data || []).map((l) => l.user_id).filter(Boolean))];
  const allIds = [...new Set([...actorIds, ...userIds])];
  const { data: users } = allIds.length
    ? await db.from("users").select("user_id,name,email").in("user_id", allIds)
    : { data: [] };
  const userMap = Object.fromEntries((users || []).map((u) => [u.user_id, u]));

  return (data || []).map((log) => ({
    ...log,
    actor: log.actor_id ? userMap[log.actor_id as string] || null : null,
    user: log.user_id ? userMap[log.user_id as string] || null : null,
  }));
}
