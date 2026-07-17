export type PartnerStatus =
  | "unclaimed"
  | "claim_pending"
  | "verified_partner"
  | "featured_partner";

export type ClaimVerificationStatus = "pending" | "approved" | "rejected";

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  unclaimed: "Unclaimed Listing",
  claim_pending: "Claim Pending",
  verified_partner: "Verified Partner",
  featured_partner: "Featured Partner",
};

export const PARTNER_STATUS_COLORS: Record<PartnerStatus, { bg: string; color: string }> = {
  unclaimed: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  claim_pending: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  verified_partner: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  featured_partner: { bg: "rgba(182,241,39,0.15)", color: "var(--primary)" },
};

export type RestaurantListing = {
  restaurant_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  cuisine?: string | null;
  primary_category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  partner_status?: PartnerStatus | string | null;
  claim_status?: string | null;
  merchant_verified?: boolean | null;
  owner_id?: string | null;
  import_source?: string | null;
};

export type RestaurantClaimRecord = {
  id: string;
  restaurant_id: string;
  user_id: string;
  owner_name: string;
  business_email: string;
  phone?: string | null;
  verification_status: ClaimVerificationStatus;
  verification_info?: Record<string, unknown>;
  created_at?: string;
  approved_at?: string | null;
};

export type PartnerAnalytics = {
  total_listed: number;
  total_claimed: number;
  verified_partners: number;
  featured_partners: number;
  pending_claims: number;
  unclaimed_opportunities: number;
  claim_conversion_rate: number;
};
