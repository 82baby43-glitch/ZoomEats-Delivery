import { requiredAgreementTypes } from "./complianceAgreements.ts";

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
};

export type OnboardingRecord = {
  current_step?: number;
  status?: string;
  stripe_connect_complete?: boolean;
};

export type ComplianceStatus = {
  authenticated: boolean;
  role: string;
  approval_status: string;
  agreement_complete: boolean;
  active: boolean;
  suspended: boolean;
  documents_complete: boolean;
  stripe_connect_complete: boolean;
  onboarding_complete: boolean;
  onboarding_step: number;
  can_access_dashboard: boolean;
  redirect_to: string | null;
  message: string | null;
  missing_agreements: string[];
  entity_type: "user" | "driver" | "restaurant" | null;
  entity_id: string | null;
};

const ONBOARDING_DONE_STATUSES = new Set(["pending_review", "approved", "needs_changes", "rejected", "submitted"]);

export function computeComplianceStatus(opts: {
  role: string;
  user?: ComplianceRecord | null;
  driver?: ComplianceRecord | null;
  restaurant?: ComplianceRecord | null;
  restaurantOnboarding?: OnboardingRecord | null;
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
    stripe_connect_complete: true,
    onboarding_complete: true,
    onboarding_step: 1,
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
      onboardingPath: "/driver/onboarding",
      onboarding_complete: true,
      onboarding_step: 1,
    });
  }

  if (role === "vendor") {
    const restaurant = opts.restaurant;
    const onboarding = opts.restaurantOnboarding;
    const approval = restaurant?.approval_status || (restaurant?.approved ? "approved" : "pending") || opts.user?.approval_status || "pending";
    const agreementComplete = restaurant?.agreement_complete ?? opts.user?.agreement_complete ?? false;
    const active = restaurant?.active ?? true;
    const suspended = Boolean(restaurant?.suspended_at) || approval === "suspended";
    const docsComplete = restaurant?.documents_complete ?? false;
    const stripeComplete = restaurant?.stripe_connect_complete ?? onboarding?.stripe_connect_complete ?? false;
    const onboardingStatus = onboarding?.status || "incomplete";
    const onboardingComplete =
      ONBOARDING_DONE_STATUSES.has(onboardingStatus) ||
      Boolean(restaurant?.approved && approval === "approved" && !onboarding);
    const onboardingStep = onboarding?.current_step ?? 1;

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete && missing.length === 0,
      active,
      suspended,
      documents_complete: docsComplete,
      stripe_connect_complete: stripeComplete,
      onboarding_complete: onboardingComplete,
      onboarding_step: onboardingStep,
      missing_agreements: missing,
      entity_type: "restaurant",
      dashboardPath: "/restaurant/dashboard",
      onboardingPath: "/restaurant/onboarding",
    });
  }

  return base;
}

function resolveGate(
  s: ComplianceStatus & { dashboardPath: string; onboardingPath?: string }
): ComplianceStatus {
  if (s.suspended || s.approval_status === "suspended") {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/login?error=account_suspended",
      message: "Account suspended",
    };
  }

  if (!s.onboarding_complete && s.onboardingPath) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: s.onboardingPath,
      message: "Complete restaurant onboarding",
    };
  }

  if (!s.agreement_complete || s.missing_agreements.length > 0) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: s.onboardingPath || "/agreements",
      message: "Agreement required",
    };
  }

  if (!s.stripe_connect_complete && s.role === "vendor") {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: s.onboardingPath || "/restaurant/onboarding",
      message: "Payout setup required",
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
  "/agreements": ["delivery", "vendor"],
  "/dispatcher": ["dispatcher", "admin"],
};
