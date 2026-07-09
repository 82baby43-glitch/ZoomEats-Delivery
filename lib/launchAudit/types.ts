export type AuditStatus = "pass" | "fail" | "warn" | "skip";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type AuditCategory =
  | "database"
  | "authentication"
  | "driver_system"
  | "restaurant_system"
  | "customer_system"
  | "order_system"
  | "payment_system"
  | "maps"
  | "notifications"
  | "pricing_engine"
  | "admin_panel"
  | "security"
  | "performance"
  | "edge_functions"
  | "api_health"
  | "realtime"
  | "storage"
  | "mobile_responsiveness"
  | "accessibility"
  | "error_handling"
  | "e2e_simulation";

export interface FixSuggestion {
  problem: string;
  why_it_matters: string;
  likely_cause: string;
  suggested_fix: string;
  estimated_effort: "low" | "medium" | "high";
}

export interface AuditCheck {
  id: string;
  name: string;
  category: AuditCategory;
  status: AuditStatus;
  severity: IssueSeverity;
  detail: string;
  duration_ms?: number;
  fix?: FixSuggestion;
}

export interface CategorySummary {
  category: AuditCategory;
  label: string;
  score: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  total: number;
  ready: boolean;
}

export interface LaunchReadinessReport {
  launch_score: number;
  status: "ready" | "caution" | "not_ready";
  status_label: string;
  checked_at: string;
  duration_ms: number;
  categories: CategorySummary[];
  checks: AuditCheck[];
  issues: {
    critical: AuditCheck[];
    high: AuditCheck[];
    medium: AuditCheck[];
    low: AuditCheck[];
  };
  performance_metrics: Record<string, number | string | null>;
  deployment_checklist: string[];
  executive_summary: string;
}

export interface LaunchAuditOptions {
  simulate_e2e?: boolean;
  probe_frontend?: boolean;
  frontend_base_url?: string;
}
