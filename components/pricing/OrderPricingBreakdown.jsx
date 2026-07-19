"use client";

import { formatMoney } from "@/lib/safeData";

function money(n) {
  return `$${formatMoney(n)}`;
}

function PriceLines({ lines, showSign = false }) {
  if (!lines?.length) return null;
  return (
    <div className="space-y-2 text-sm">
      {lines.map((line) => (
        <div
          key={line.label}
          className={`flex justify-between gap-3 ${line.highlight ? "font-display font-bold text-base pt-2 border-t" : ""}`}
          style={line.highlight ? { borderColor: "var(--border)" } : undefined}
        >
          <span style={{ color: line.highlight ? "var(--text)" : "var(--muted)" }}>{line.label}</span>
          <span style={{ color: line.negative ? "var(--primary)" : undefined }}>
            {line.negative && showSign ? "-" : ""}
            {money(line.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CustomerOrderBreakdown({ breakdown, loading = false, itemsFirst = true }) {
  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Calculating…</p>;
  if (!breakdown) return null;

  return (
    <div className="space-y-3" data-testid="customer-order-breakdown">
      {itemsFirst && breakdown.items?.length > 0 && (
        <div className="space-y-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
          {breakdown.items.map((it) => (
            <div key={`${it.name}-${it.quantity}`} className="flex justify-between gap-3 text-sm">
              <span>{it.quantity}× {it.name}</span>
              <span>{money(it.line_total)}</span>
            </div>
          ))}
        </div>
      )}
      <PriceLines lines={breakdown.lines} showSign />
    </div>
  );
}

export function DriverOrderBreakdown({ breakdown, compact = false, source }) {
  if (!breakdown) return null;
  return (
    <div className={compact ? "space-y-1" : "space-y-2"} data-testid="driver-order-breakdown">
      {!compact && (
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
          <span>Earnings breakdown</span>
          {source && <span className="capitalize">{source}</span>}
        </div>
      )}
      <PriceLines lines={breakdown.lines} />
    </div>
  );
}

export function RestaurantOrderBreakdown({ breakdown, compact = false }) {
  if (!breakdown) return null;
  return (
    <div className={compact ? "space-y-1" : "space-y-2"} data-testid="restaurant-order-breakdown">
      {!compact && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>Payout breakdown</div>
      )}
      <PriceLines lines={breakdown.lines} showSign />
    </div>
  );
}
