"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function PricingLine({ line }) {
  const isDiscount = line.isDiscount;
  const isTotal = line.isTotal;

  return (
    <div
      className={`flex justify-between gap-3 items-start ${isTotal ? "font-display font-bold text-lg pt-2 border-t" : ""}`}
      style={{ borderColor: isTotal ? "var(--border)" : undefined }}
      data-testid={`pricing-line-${line.key}`}
    >
      <span
        className="flex items-start gap-1.5 min-w-0"
        style={{ color: isTotal ? "var(--text)" : isDiscount ? "var(--primary)" : "var(--muted)" }}
      >
        <span className={isDiscount ? "font-semibold" : ""}>
          {line.label}
          {line.meta ? (
            <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
              {" "}· {line.meta}
            </span>
          ) : null}
        </span>
        {line.helpText && !isTotal ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 mt-0.5 opacity-60 hover:opacity-100"
                aria-label={`About ${line.label}`}
              >
                <Info size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-left leading-snug">
              {line.helpText}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span className="shrink-0" style={{ color: isDiscount ? "var(--primary)" : undefined }}>
        {isDiscount ? `-${money(Math.abs(line.amount))}` : money(line.amount)}
      </span>
    </div>
  );
}

export default function IntelligentCheckoutPricing({
  quote,
  loading = false,
  subtotalFallback = 0,
  cartItems = [],
  showHeader = true,
  compact = false,
}) {
  const lines = quote?.customer_lines;
  const insights = quote?.checkout_insights;
  const surge = quote?.surge_multiplier;
  const miles = quote?.distance_miles;

  if (loading) {
    return (
      <div className="text-sm animate-pulse" style={{ color: "var(--muted)" }} data-testid="checkout-pricing-loading">
        Calculating your order total…
      </div>
    );
  }

  if (!lines?.length) {
    return (
      <div className="space-y-2 text-sm" data-testid="checkout-pricing-empty">
        {showHeader && <div className="font-bold">Order summary</div>}
        {cartItems.length > 0 ? (
          <div className="space-y-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
            {cartItems.map((it) => (
              <div key={`${it.name}-${it.quantity}`} className="flex justify-between gap-3 text-sm">
                <span>{it.quantity}× {it.name}</span>
                <span>{money((it.price || 0) * it.quantity)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-between">
            <span>Items</span>
            <span>{money(subtotalFallback)}</span>
          </div>
        )}
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Enter your delivery address for distance-based fees and live pricing.
        </p>
      </div>
    );
  }

  const itemLines = lines.filter((l) => l.key === "subtotal");
  const feeLines = lines.filter((l) => l.key !== "subtotal" && !l.isTotal);
  const totalLine = lines.find((l) => l.isTotal);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={compact ? "space-y-2 text-sm" : "space-y-3 text-sm"}
        data-testid="intelligent-checkout-pricing"
      >
        {showHeader && (
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">Order summary</span>
            {miles != null && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {Number(miles).toFixed(1)} mi
                {surge > 1 ? ` · ${surge}x demand` : ""}
              </span>
            )}
          </div>
        )}

        {insights?.total_savings > 0 && (
          <div
            className="rounded-lg px-3 py-2 text-xs font-semibold"
            style={{
              background: "color-mix(in srgb, #16a34a 14%, transparent)",
              color: "#15803d",
            }}
            data-testid="checkout-savings-banner"
          >
            You saved {money(insights.total_savings)}
            {insights.savings_labels?.[0] ? ` — ${insights.savings_labels[0]}` : ""}
          </div>
        )}

        {insights?.smart_messages?.map((msg) => (
          <p
            key={msg}
            className="text-xs rounded-lg px-3 py-2"
            style={{
              background: "color-mix(in srgb, var(--primary) 8%, transparent)",
              color: "var(--muted)",
            }}
            data-testid="checkout-smart-message"
          >
            {msg}
          </p>
        ))}

        {quote?.blocked && quote?.block_reason && (
          <p className="text-xs font-medium" style={{ color: "var(--primary)" }} data-testid="checkout-blocked">
            {quote.block_reason}
          </p>
        )}

        {cartItems.length > 0 && (
          <div className="space-y-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
            {cartItems.map((it) => (
              <div key={`${it.name}-${it.quantity}`} className="flex justify-between gap-3">
                <span>{it.quantity}× {it.name}</span>
                <span>{money((it.price || 0) * it.quantity)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {feeLines.map((line) => (
            <PricingLine key={line.key} line={line} />
          ))}
          {totalLine && <PricingLine line={totalLine} />}
        </div>
      </div>
    </TooltipProvider>
  );
}
