"use client";

import Header from "@/components/Header";
import Link from "next/link";
import AdminPricingDashboard from "@/components/admin/AdminPricingDashboard";

export default function AdminPricing() {
  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Pricing Engine</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Marketplace economics — fees, driver pay, settlements, and AI recommendations.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin dashboard</Link>
        </div>
        <AdminPricingDashboard />
      </div>
    </div>
  );
}
