import { requiredAgreementTypes } from "./complianceAgreements.ts";

export const ROLE_ALIASES: Record<string, string> = {
  driver: "delivery",
  restaurant: "vendor",
  restaurant_owner: "vendor",
  restaurant_staff: "vendor",
  super_admin: "admin",
};

export const VALID_ROLES = [
  "customer",
  "vendor",
  "delivery",
  "admin",
  "dispatcher",
  "driver",
  "restaurant_owner",
  "restaurant_staff",
  "founder_driver",
  "super_admin",
] as const;
export type AppRole = (typeof VALID_ROLES)[number];

export function normalizeRole(role: string): string {
  return ROLE_ALIASES[role] || role;
}

export function roleMatches(userRole: string, allowed: string[]): boolean {
  const normalized = normalizeRole(userRole);
  const expanded = allowed.flatMap((r) => [r, ROLE_ALIASES[r] || r]);
  return expanded.includes(userRole) || expanded.includes(normalized);
}

const STALE_ENTITY_APPROVAL = ["verification", "review", "pending", "documents_missing"];

/** Prefer admin-approved user status when the entity row was not synced. */
export function mergeApprovalStatus(entityStatus?: string | null, userStatus?: string | null): string {
  const entity = entityStatus || null;
  const user = userStatus || null;
  if (user === "approved" && entity && STALE_ENTITY_APPROVAL.includes(entity)) return "approved";
  if (entity === "approved" || user === "approved") return "approved";
  if (entity === "suspended" || user === "suspended") return "suspended";
  if (entity === "rejected" || user === "rejected") return "rejected";
  return entity || user || "pending";
}

function mergeAgreementComplete(
  entityComplete?: boolean,
  userComplete?: boolean,
  missingCount = 0,
  approvalStatus?: string
): boolean {
  if (approvalStatus === "approved") return true;
  return (Boolean(entityComplete) || Boolean(userComplete)) && missingCount === 0;
}

function mergeActive(
  entityActive?: boolean,
  userActive?: boolean,
  entityApproval?: string,
  userApproval?: string
): boolean {
  const approval = mergeApprovalStatus(entityApproval, userApproval);
  if (approval === "approved") return entityActive ?? userActive ?? true;
  if (entityActive === false || userActive === false) return false;
  return entityActive ?? userActive ?? true;
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
}): ComplianceStatus {
  const role = normalizeRole(opts.role);
  const accepted = new Set(opts.acceptedTypes || []);
  const missing = requiredAgreementTypes(role).filter((t) => !accepted.has(t));

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

  if (role === "admin" || role === "customer") {
    return base;
  }

  if (role === "dispatcher") {
    return { ...base, entity_type: "user" };
  }

  if (role === "delivery") {
    const driver = opts.driver;
    const approval = mergeApprovalStatus(driver?.approval_status, opts.user?.approval_status);
    const agreementComplete = mergeAgreementComplete(
      driver?.agreement_complete,
      opts.user?.agreement_complete,
      missing.length,
      approval
    );
    const active = mergeActive(driver?.active, opts.user?.active, driver?.approval_status, opts.user?.approval_status);
    const suspended = Boolean(driver?.suspended_at || opts.user?.suspended_at) || approval === "suspended";
    const docsComplete = driver?.documents_complete ?? false;

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete,
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
    const entityApproval = restaurant?.approval_status || (restaurant?.approved ? "approved" : null);
    const approval = mergeApprovalStatus(entityApproval, opts.user?.approval_status);
    const agreementComplete = mergeAgreementComplete(
      restaurant?.agreement_complete,
      opts.user?.agreement_complete,
      missing.length,
      approval
    );
    const active = mergeActive(restaurant?.active, opts.user?.active, entityApproval, opts.user?.approval_status);
    const suspended = Boolean(restaurant?.suspended_at || opts.user?.suspended_at) || approval === "suspended";

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete,
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
  const isApproved = s.approval_status === "approved";

  if (s.suspended || s.approval_status === "suspended") {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/login?error=account_suspended",
      message: "Account suspended",
    };
  }
  if (!isApproved && (!s.agreement_complete || s.missing_agreements.length > 0)) {
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
  if (!s.active && !isApproved) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/pending-approval",
      message: "Account inactive",
    };
  }
  return {
    ...s,
    can_access_dashboard: true,
    redirect_to: null,
    message: null,
    agreement_complete: isApproved ? true : s.agreement_complete,
    missing_agreements: isApproved ? [] : s.missing_agreements,
  };
}

export const PROTECTED_ROUTE_ROLES: Record<string, string[]> = {
  "/delivery": ["delivery"],
  "/driver": ["delivery"],
  "/vendor": ["vendor"],
  "/restaurant": ["vendor"],
  "/admin": ["admin"],
  "/disclosure": ["delivery"],
  "/agreements": ["delivery", "vendor"],
  "/dispatcher": ["dispatcher", "admin"],
};
