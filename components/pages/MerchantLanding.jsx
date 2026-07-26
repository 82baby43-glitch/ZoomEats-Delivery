"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart3,
  ChefHat,
  Clock,
  LayoutDashboard,
  Shield,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import Header from "@/components/Header";

const SALES_MAILTO = "mailto:support@zoomeats.com?subject=ZoomEats%20Merchant%20Partnership";

const CATEGORIES = [
  { slug: "restaurants", label: "Restaurant", desc: "Full-service dining, fast casual, and local favorites." },
  { slug: "local_retail", label: "Local Retail", desc: "Neighborhood shops with delivery and pickup." },
  { slug: "convenience_stores", label: "Convenience Store", desc: "Essentials, snacks, and household items." },
  { slug: "licensed_dispensary", label: "Licensed Dispensary", desc: "Regulated cannabis with compliance tooling.", href: "/restaurant/onboarding?category=licensed_dispensary" },
];

const FEATURES = [
  { icon: LayoutDashboard, title: "Merchant Dashboard", desc: "Orders, menu, analytics, and store settings in one place." },
  { icon: Truck, title: "ZoomEats Connect™", desc: "Driver assignment, pickup coordination, and live delivery tracking." },
  { icon: BarChart3, title: "Sales Analytics", desc: "Revenue, popular items, prep times, and customer insights." },
  { icon: Wallet, title: "Payouts", desc: "Transparent earnings, pending balance, and payout schedules." },
  { icon: Clock, title: "Store Hours", desc: "Control availability and operational hours." },
  { icon: Shield, title: "Compliance Ready", desc: "Category-specific onboarding for regulated merchants." },
];

const DEMO_HIGHLIGHTS = [
  "Incoming order alerts with sound",
  "Full order workflow simulation",
  "Menu management preview",
  "Guided walkthrough tour",
];

function MerchantMobileFooter() {
  return (
    <footer
      className="md:hidden border-t px-6 py-8 pb-10 space-y-6"
      style={{ borderColor: "var(--border)" }}
      data-testid="merchant-mobile-footer"
    >
      <div className="text-center space-y-3">
        <div className="label-eyebrow">For merchants</div>
        <h1 className="font-display text-3xl font-black tracking-tight leading-tight">
          Grow your business with ZoomEats
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Reach more local customers, manage orders in real time, and explore the merchant dashboard before you sign up — no account required.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ChefHat size={22} className="shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
          <div>
            <div className="font-display text-lg font-bold">Interactive merchant demo</div>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Simulate orders, menu changes, analytics, and ZoomEats Connect™ logistics with realistic sample data.
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {DEMO_HIGHLIGHTS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Store size={14} className="shrink-0" style={{ color: "var(--primary)" }} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">Built for every merchant category</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Use the same onboarding flow you will see in production — we support restaurants, retail, convenience, and licensed dispensaries.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={cat.href || `/signup/merchant?category=${cat.slug}`}
              className="card p-3 hover:ring-2 hover:ring-[var(--primary)] transition"
            >
              <UtensilsCrossed size={14} style={{ color: "var(--primary)" }} />
              <div className="font-semibold text-sm mt-2">{cat.label}</div>
              <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>{cat.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">Everything you need to run delivery</h2>
        <div className="grid grid-cols-2 gap-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card p-3">
              <feature.icon size={16} style={{ color: "var(--primary)" }} />
              <div className="font-semibold mt-2 text-sm">{feature.title}</div>
              <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 text-center space-y-3">
        <h2 className="font-display text-xl font-black">Ready to partner with ZoomEats?</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Explore the dashboard first, then create your merchant account when you are ready.
        </p>
      </div>

      <div className="space-y-3" data-testid="merchant-landing-ctas">
        <Link href="/demo/merchant" className="btn-primary w-full text-center block" data-testid="merchant-try-dashboard-cta">
          Try Demo Merchant
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/signup/merchant" className="btn-ghost border text-center" data-testid="merchant-signup-cta">
            Sign Up
          </Link>
          <a href={SALES_MAILTO} className="btn-ghost border text-center" data-testid="merchant-contact-sales-cta">
            Contact Sales
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function MerchantLanding() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="hidden md:block">
        <section className="max-w-7xl mx-auto px-6 md:px-12 pt-12 pb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="label-eyebrow">For merchants</div>
              <h1 className="font-display text-5xl md:text-6xl font-black tracking-tight leading-[0.95] mt-3">
                Grow your business with ZoomEats
              </h1>
              <p className="text-lg mt-5 max-w-xl" style={{ color: "var(--muted)" }}>
                Reach more local customers, manage orders in real time, and explore the merchant dashboard before you sign up — no account required.
              </p>
              <div className="mt-8 flex flex-wrap gap-3" data-testid="merchant-landing-ctas">
                <Link href="/signup/merchant" className="btn-primary" data-testid="merchant-signup-cta">
                  Sign Up
                </Link>
                <Link href="/demo/merchant" className="btn-ghost border-2" style={{ borderColor: "var(--primary)" }} data-testid="merchant-try-dashboard-cta">
                  Try the Dashboard
                </Link>
                <a href={SALES_MAILTO} className="btn-ghost" data-testid="merchant-contact-sales-cta">
                  Contact Sales
                </a>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-6 md:p-8"
            >
              <div className="flex items-center gap-3">
                <ChefHat size={28} style={{ color: "var(--primary)" }} />
                <div>
                  <div className="font-display text-2xl font-bold">Interactive merchant demo</div>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    Simulate orders, menu changes, analytics, and ZoomEats Connect™ logistics with realistic sample data.
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {DEMO_HIGHLIGHTS.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Store size={14} style={{ color: "var(--primary)" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/demo/merchant" className="btn-primary w-full mt-6 text-center block">
                Launch Demo Dashboard
              </Link>
            </motion.div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 md:px-12 py-16 border-t" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-3xl font-bold">Built for every merchant category</h2>
          <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
            Use the same onboarding flow you will see in production — we support restaurants, retail, convenience, and licensed dispensaries.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={cat.href || `/signup/merchant?category=${cat.slug}`}
                className="card p-5 hover:ring-2 hover:ring-[var(--primary)] transition"
              >
                <UtensilsCrossed size={20} style={{ color: "var(--primary)" }} />
                <h3 className="font-bold mt-3">{cat.label}</h3>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{cat.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 md:px-12 py-16 border-t" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-3xl font-bold">Everything you need to run delivery</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card p-5">
                <feature.icon size={22} style={{ color: "var(--primary)" }} />
                <h3 className="font-bold mt-3">{feature.title}</h3>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
          <div className="card p-8 md:p-12 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-black">Ready to partner with ZoomEats?</h2>
            <p className="mt-3 max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
              Explore the dashboard first, then create your merchant account when you are ready.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/demo/merchant" className="btn-ghost border">Try the Dashboard</Link>
              <Link href="/signup/merchant" className="btn-primary">Sign Up</Link>
              <a href={SALES_MAILTO} className="btn-ghost">Contact Sales</a>
            </div>
          </div>
        </section>
      </div>

      <MerchantMobileFooter />
    </div>
  );
}
