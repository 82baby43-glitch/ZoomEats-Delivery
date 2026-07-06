import { requiredAgreementTypes } from "./agreements";

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
  stripe_connect_complete?: boolean;
  payouts_enabled?: boolean;
  identity_verified?: boolean;
  requires_reverification?: boolean;
  accepting_orders?: boolean;
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
  stripe_connect_complete: boolean;
  payouts_enabled: boolean;
  identity_verified: boolean;
  requires_reverification: boolean;
  payout_ready: boolean;
  accepting_orders: boolean;
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
    stripe_connect_complete: true,
    payouts_enabled: true,
    identity_verified: true,
    requires_reverification: false,
    payout_ready: true,
    accepting_orders: true,
  };

  if (role === "admin" || role === "customer") {
    return base;
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
    const stripeComplete = driver?.stripe_connect_complete ?? false;
    const payoutsEnabled = driver?.payouts_enabled ?? false;
    const identityVerified = driver?.identity_verified ?? false;
    const requiresReverification = driver?.requires_reverification ?? false;
    const payoutReady = stripeComplete && payoutsEnabled && !requiresReverification;

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
      stripe_connect_complete: stripeComplete,
      payouts_enabled: payoutsEnabled,
      identity_verified: identityVerified,
      requires_reverification: requiresReverification,
      payout_ready: payoutReady,
      accepting_orders: driver?.accepting_orders ?? payoutReady,
      payoutSetupPath: "/driver/dashboard?tab=payouts",
    });
  }

  if (role === "vendor") {
    const restaurant = opts.restaurant;
    const approval = restaurant?.approval_status || (restaurant?.approved ? "approved" : "pending") || "pending";
    const agreementComplete = restaurant?.agreement_complete ?? false;
    const active = restaurant?.active ?? true;
    const suspended = Boolean(restaurant?.suspended_at) || approval === "suspended";
    const stripeComplete = restaurant?.stripe_connect_complete ?? false;
    const payoutsEnabled = restaurant?.payouts_enabled ?? false;
    const identityVerified = restaurant?.identity_verified ?? false;
    const requiresReverification = restaurant?.requires_reverification ?? false;
    const payoutReady = stripeComplete && payoutsEnabled && !requiresReverification;

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
      stripe_connect_complete: stripeComplete,
      payouts_enabled: payoutsEnabled,
      identity_verified: identityVerified,
      requires_reverification: requiresReverification,
      payout_ready: payoutReady,
      accepting_orders: restaurant?.accepting_orders ?? payoutReady,
      payoutSetupPath: "/restaurant/dashboard?tab=payouts",
    });
  }

  return base;
}

function resolveGate(
  s: ComplianceStatus & { dashboardPath: string; payoutSetupPath: string }
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
  if (s.requires_reverification || !s.payout_ready) {
    return {
      ...s,
      can_access_dashboard: true,
      redirect_to: s.payoutSetupPath,
      message: s.requires_reverification ? "Payout reverification required" : "Complete payout setup",
      accepting_orders: false,
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
  "/agreements": ["delivery", "vendor"],
  "/dispatcher": ["dispatcher", "admin"],
};
