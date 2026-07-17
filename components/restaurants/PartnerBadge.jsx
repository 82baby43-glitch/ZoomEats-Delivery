"use client";

import { PARTNER_STATUS_COLORS, PARTNER_STATUS_LABELS } from "@/lib/partners/types";

export default function PartnerBadge({ status, className = "" }) {
  const normalized =
    status === "claim_pending" || status === "verified_partner" || status === "featured_partner"
      ? status
      : "unclaimed";
  const style = PARTNER_STATUS_COLORS[normalized];
  const label = PARTNER_STATUS_LABELS[normalized];

  return (
    <span
      className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${className}`}
      style={{ background: style.bg, color: style.color }}
      data-testid={`partner-badge-${normalized}`}
    >
      {label}
    </span>
  );
}
