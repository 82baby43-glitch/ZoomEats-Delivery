import { computeMissingAgreements } from "./complianceAgreements.ts";

export const ROLE_ALIASES: Record<string, string> = {
  driver: "delivery",
  restaurant: "vendor",
};

export const VALID_ROLES = ["customer", "vendor", "delivery", "admin", "dispatcher"] as const;
export type AppRole = (typeof VALID_ROLES)[number];

export function normalizeRole(role: string): string {
  return ROLE_ALIASES[role] || role;
}

export function roleMatches(userRole: string, allowed: string[]): boolean {
  const normalized = normalizeRole(userRole);
  const expanded = allowed.flatMap((r) => [r, ROLE_ALIASES[r] || r]);
  return expanded.includes(userRole) || expanded.includes(normalized);
}

export type ComplianceRecord = {
  approval_status: string;
  agreement_complete: boolean;
  active: boolean;
  suspended_at?: string | null;
  documents_complete?: boolean;
  approved?: boolean;
};

export type ComplianceStatus = {
  authenticated: boolean;
  role: string;
  approval_status: string;
  agreement_complete: boolean;
  active: boolean;
  suspended: boolean;
  documents_complete: boolean;
  can_access_dashboard: boolean;
  redirect_to: string | null;
  message: string | null;
  missing_agreements: string[];
  entity_type: "user" | "driver" | "restaurant" | null;
  entity_id: string | null;
};

export function computeComplianceStatus(opts: {
  role: string;
  user?: ComplianceRecord | null;
  driver?: ComplianceRecord | null;
  restaurant?: ComplianceRecord | null;
  acceptedTypes?: string[];
  acceptances?: Array<{ agreement_type: string; agreement_version?: string }>;
}): ComplianceStatus {
  const role = normalizeRole(opts.role);
  const missing = computeMissingAgreements(role, opts.acceptances || []);

  const base: ComplianceStatus = {
    authenticated: true,
    role,
    approval_status: "approved",
    agreement_complete: true,
    active: true,
    suspended: false,
    documents_complete: true,
    can_access_dashboard: true,
    redirect_to: null,
    message: null,
    missing_agreements: [],
    entity_type: null,
    entity_id: null,
  };

  if (role === "admin") {
    return base;
  }

  if (role === "customer") {
    const suspended = Boolean(opts.user?.suspended_at);
    const agreementComplete = missing.length === 0;

    if (suspended) {
      return {
        ...base,
        agreement_complete: false,
        suspended: true,
        can_access_dashboard: false,
        redirect_to: "/login?error=account_suspended",
        message: "Account suspended",
        missing_agreements: missing,
        entity_type: "user",
      };
    }

    if (!agreementComplete) {
      return {
        ...base,
        agreement_complete: false,
        can_access_dashboard: false,
        redirect_to: "/customer/agreements",
        message: "Agreement required",
        missing_agreements: missing,
        entity_type: "user",
      };
    }

    return { ...base, entity_type: "user", agreement_complete: true, missing_agreements: [] };
  }

  if (role === "dispatcher") {
    return { ...base, entity_type: "user" };
  }

  if (role === "delivery") {
    const driver = opts.driver;
    const approval = driver?.approval_status || opts.user?.approval_status || "pending";
    const agreementComplete = driver?.agreement_complete ?? opts.user?.agreement_complete ?? false;
    const active = driver?.active ?? opts.user?.active ?? true;
    const suspended = Boolean(driver?.suspended_at || opts.user?.suspended_at) || approval === "suspended";
    const docsComplete = driver?.documents_complete ?? false;

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete && missing.length === 0,
      active,
      suspended,
      documents_complete: docsComplete,
      missing_agreements: missing,
      entity_type: "driver",
      dashboardPath: "/driver/dashboard",
    });
  }

  if (role === "vendor") {
    const restaurant = opts.restaurant;
    const approval = restaurant?.approval_status || (restaurant?.approved ? "approved" : "pending") || "pending";
    const agreementComplete = restaurant?.agreement_complete ?? false;
    const active = restaurant?.active ?? true;
    const suspended = Boolean(restaurant?.suspended_at) || approval === "suspended";

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete && missing.length === 0,
      active,
      suspended,
      documents_complete: true,
      missing_agreements: missing,
      entity_type: "restaurant",
      dashboardPath: "/restaurant/dashboard",
    });
  }

  return base;
}

function resolveGate(
  s: ComplianceStatus & { dashboardPath: string }
): ComplianceStatus {
  if (s.suspended || s.approval_status === "suspended") {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/login?error=account_suspended",
      message: "Account suspended",
    };
  }
  if (!s.agreement_complete || s.missing_agreements.length > 0) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/agreements",
      message: "Agreement required",
    };
  }
  if (["pending", "documents_missing", "verification", "review"].includes(s.approval_status)) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/pending-approval",
      message: "Approval pending",
    };
  }
  if (s.approval_status === "rejected") {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/pending-approval",
      message: "Account not approved",
    };
  }
  if (!s.active) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/pending-approval",
      message: "Account inactive",
    };
  }
  return { ...s, can_access_dashboard: true, redirect_to: null, message: null };
}

export const PROTECTED_ROUTE_ROLES: Record<string, string[]> = {
  "/delivery": ["delivery"],
  "/driver": ["delivery"],
  "/vendor": ["vendor"],
  "/restaurant": ["vendor"],
  "/admin": ["admin"],
  "/disclosure": ["delivery"],
  "/agreements": ["delivery", "vendor", "customer"],
  "/customer/agreements": ["customer"],
  "/dispatcher": ["dispatcher", "admin"],
};
