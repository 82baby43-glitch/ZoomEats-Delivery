"use client";

import Link from "next/link";

const SALES_MAILTO = "mailto:support@zoomeats.com?subject=ZoomEats%20Merchant%20Partnership";

export default function MerchantDemoSignupBar() {
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 border-t px-4 py-3 md:py-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      data-testid="merchant-demo-signup-bar"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <div className="font-display font-bold text-base md:text-lg">Ready to Join ZoomEats?</div>
          <p className="text-xs md:text-sm" style={{ color: "var(--muted)" }}>
            Start your merchant account in minutes — same onboarding flow as production partners.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Link href="/signup/merchant" className="btn-primary flex-1 sm:flex-none text-center" data-testid="demo-create-account">
            Create Merchant Account
          </Link>
          <a href={SALES_MAILTO} className="btn-ghost flex-1 sm:flex-none text-center border" data-testid="demo-contact-sales">
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  );
}
