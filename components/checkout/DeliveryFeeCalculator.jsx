"use client";

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export default function DeliveryFeeCalculator({
  quote,
  loading = false,
  subtotalFallback = 0,
  showHeader = true,
  compact = false,
}) {
  const lines = quote?.customer_lines;
  const surge = quote?.surge_multiplier;
  const miles = quote?.distance_miles;
  const freeDelivery = quote?.free_delivery;

  if (loading) {
    return (
      <div className="text-sm animate-pulse" style={{ color: "var(--muted)" }} data-testid="delivery-fee-calculator-loading">
        Calculating delivery fees…
      </div>
    );
  }

  if (!lines?.length) {
    return (
      <div className="space-y-2 text-sm" data-testid="delivery-fee-calculator">
        {showHeader && <div className="font-bold">Price estimate</div>}
        <div className="flex justify-between"><span>Items</span><span>{money(subtotalFallback)}</span></div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Enter your delivery address for distance-based fees and surge pricing.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1 text-sm" : "space-y-2 text-sm"} data-testid="delivery-fee-calculator">
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">Delivery fee calculator</span>
          {miles != null && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {Number(miles).toFixed(1)} mi
              {surge > 1 ? ` · ${surge}x surge` : ""}
            </span>
          )}
        </div>
      )}

      {freeDelivery?.eligible && (
        <div
          className="rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}
          data-testid="free-delivery-banner"
        >
          Free delivery{freeDelivery.reason ? ` — ${freeDelivery.reason}` : ""}
        </div>
      )}

      {lines.map((line) => (
        <div
          key={line.key}
          className={`flex justify-between gap-3 ${line.isTotal ? "font-display font-bold text-lg pt-2 border-t" : ""} ${line.isDiscount ? "font-semibold" : ""}`}
          style={{
            borderColor: line.isTotal ? "var(--border)" : undefined,
            color: line.isDiscount ? "var(--primary)" : undefined,
          }}
        >
          <span style={{ color: line.isTotal || line.isDiscount ? undefined : "var(--muted)" }}>
            {line.label}
            {line.meta ? ` · ${line.meta}` : ""}
          </span>
          <span>{line.isDiscount ? `-${money(Math.abs(line.amount))}` : money(line.amount)}</span>
        </div>
      ))}
    </div>
  );
}
