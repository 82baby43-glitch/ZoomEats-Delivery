"use client";

import {
  DISPENSARY_CATEGORY_DESCRIPTION,
  DISPENSARY_LICENSING_ACKNOWLEDGMENT,
  MERCHANT_RESPONSIBILITIES,
  ZOOMEATS_PROVIDES,
} from "@/lib/merchant/dispensaryPositioning";

export default function MerchantComplianceResponsibilities({ showAcknowledgment = false, acknowledged = false, onAcknowledgeChange }) {
  return (
    <section
      className="space-y-4 p-4 rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      data-testid="merchant-compliance-responsibilities"
    >
      <div>
        <h4 className="font-bold">Merchant Compliance Responsibilities</h4>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {DISPENSARY_CATEGORY_DESCRIPTION}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold mb-2">Merchant Responsibilities</div>
          <ul className="space-y-1 list-disc list-inside" style={{ color: "var(--muted)" }}>
            {MERCHANT_RESPONSIBILITIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2">ZoomEats Provides</div>
          <ul className="space-y-1 list-disc list-inside" style={{ color: "var(--muted)" }}>
            {ZOOMEATS_PROVIDES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {showAcknowledgment && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledgeChange?.(e.target.checked)}
            data-testid="licensing-acknowledgment"
          />
          {DISPENSARY_LICENSING_ACKNOWLEDGMENT}
        </label>
      )}
    </section>
  );
}
