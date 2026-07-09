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
};

export type OnboardingProgressRecord = {
  completed_steps?: unknown[];
  current_step?: number;
  stripe_connect_complete?: boolean;
  documents_complete?: boolean;
  agreements_complete?: boolean;
  approval_status?: string;
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

export function computeComplianceStatus(opts: {
  role: string;
  user?: ComplianceRecord | null;
  driver?: ComplianceRecord | null;
  restaurant?: ComplianceRecord | null;
  acceptedTypes?: string[];
  onboarding?: OnboardingProgressRecord | null;
  driverOnboarding?: { stripe_connect_complete?: boolean; bank_verified?: boolean } | null;
  restaurantOnboarding?: { stripe_connect_complete?: boolean; bank_verified?: boolean } | null;
}): ComplianceStatus {
  const role = normalizeRole(opts.role);
  const accepted = new Set(opts.acceptedTypes || []);
  const missing = requiredAgreementTypes(role).filter((t) => !accepted.has(t));
  const onboarding = opts.onboarding;
  const stripeComplete = onboarding?.stripe_connect_complete
    ?? opts.driverOnboarding?.stripe_connect_complete
    ?? opts.restaurantOnboarding?.stripe_connect_complete
    ?? false;
  const docsComplete = onboarding?.documents_complete ?? false;
  const onboardingStep = onboarding?.current_step ?? 1;
  const completedSteps = Array.isArray(onboarding?.completed_steps) ? onboarding.completed_steps.length : 0;
  const onboardingComplete = completedSteps >= 4 && docsComplete && stripeComplete && missing.length === 0;

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
    onboarding_step: 4,
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
    const agreementComplete = (driver?.agreement_complete ?? opts.user?.agreement_complete ?? false) && missing.length === 0;
    const active = driver?.active ?? opts.user?.active ?? true;
    const suspended = Boolean(driver?.suspended_at || opts.user?.suspended_at) || approval === "suspended";
    const driverDocsComplete = driver?.documents_complete ?? docsComplete;

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete,
      active,
      suspended,
      documents_complete: driverDocsComplete,
      stripe_connect_complete: stripeComplete,
      onboarding_complete: onboardingComplete,
      onboarding_step: onboardingStep,
      missing_agreements: missing,
      entity_type: "driver",
      dashboardPath: "/driver/dashboard",
      onboardingPath: "/driver/onboarding",
    });
  }

  if (role === "vendor") {
    const restaurant = opts.restaurant;
    const approval = restaurant?.approval_status || (restaurant?.approved ? "approved" : "pending") || "pending";
    const agreementComplete = (restaurant?.agreement_complete ?? false) && missing.length === 0;
    const active = restaurant?.active ?? true;
    const suspended = Boolean(restaurant?.suspended_at) || approval === "suspended";

    return resolveGate({
      ...base,
      approval_status: approval,
      agreement_complete: agreementComplete,
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
  s: ComplianceStatus & { dashboardPath: string; onboardingPath: string }
): ComplianceStatus {
  if (s.suspended || s.approval_status === "suspended") {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: "/login?error=account_suspended",
      message: "Account suspended",
    };
  }

  if (!s.onboarding_complete || s.onboarding_step < 4 || !s.documents_complete || !s.stripe_connect_complete) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: s.onboardingPath,
      message: "Complete onboarding to continue",
    };
  }

  if (!s.agreement_complete || s.missing_agreements.length > 0) {
    return {
      ...s,
      can_access_dashboard: false,
      redirect_to: `${s.onboardingPath}?step=4`,
      message: "Legal agreements required",
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
  "/driver/onboarding": ["delivery"],
  "/restaurant/onboarding": ["vendor"],
  "/dispatcher": ["dispatcher", "admin"],
};
