"use client";

import { formatMoney } from "@/lib/safeData";

const LINE_LABELS = {
  base_pay: "Base pay",
  mileage_pay: "Per-mile pay",
  time_pay: "Per-minute pay",
  wait_pay: "Wait time",
  peak_bonus: "Peak pay",
  long_distance_bonus: "Long-distance bonus",
  large_order_bonus: "Large order bonus",
  weather_bonus: "Weather bonus",
  bonus_pay: "Bonus",
  guaranteed_top_up: "Guaranteed minimum top-up",
  customer_tip: "Customer tip (100%)",
};

export default function DriverEarningsBreakdown({ breakdown, lines, compact = false, source }) {
  if (!breakdown) return null;

  const displayLines =
    lines ||
    Object.entries(LINE_LABELS)
      .map(([key, label]) => ({
        label,
        amount: Number(breakdown[key] || 0),
        highlight: ["peak_bonus", "long_distance_bonus", "guaranteed_top_up", "customer_tip"].includes(key),
      }))
      .filter((l) => l.amount > 0);

  return (
    <div className={compact ? "space-y-1 text-sm" : "space-y-2"} data-testid="driver-earnings-breakdown">
      {!compact && (
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
          <span>Earnings breakdown</span>
          {source && <span className="capitalize">{source}</span>}
        </div>
      )}
      {displayLines.map((line) => (
        <div
          key={line.label}
          className={`flex justify-between gap-3 ${line.highlight ? "font-semibold" : ""}`}
        >
          <span style={{ color: line.highlight ? "var(--text)" : "var(--muted)" }}>{line.label}</span>
          <span>${formatMoney(line.amount)}</span>
        </div>
      ))}
      <div
        className={`flex justify-between gap-3 pt-2 border-t font-display font-bold ${compact ? "text-sm" : "text-base"}`}
        style={{ borderColor: "var(--border)" }}
      >
        <span>Total payout</span>
        <span style={{ color: "var(--primary)" }}>${formatMoney(breakdown.final_driver_pay)}</span>
      </div>
      {breakdown.guaranteed_pay > 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Guaranteed minimum ${formatMoney(breakdown.guaranteed_pay)} before tip
        </p>
      )}
    </div>
  );
}
