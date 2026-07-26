"use client";

export default function MerchantDemoBanner() {
  return (
    <div
      className="sticky top-0 z-40 border-b px-4 py-2.5 text-center text-sm"
      style={{ background: "rgba(251, 191, 36, 0.12)", borderColor: "rgba(251, 191, 36, 0.35)", color: "#fbbf24" }}
      data-testid="merchant-demo-banner"
    >
      <strong>Demo Mode</strong> — You are exploring a simulated ZoomEats merchant dashboard. No real business data is being used.
    </div>
  );
}
