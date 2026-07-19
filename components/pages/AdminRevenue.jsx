"use client";

import Header from "@/components/Header";
import Link from "next/link";
import RevenueCenter from "@/components/admin/RevenueCenter";

export default function AdminRevenue() {
  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Revenue Center</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Platform revenue, driver earnings, restaurant payouts, and commission tracking.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin dashboard</Link>
          <Link href="/admin/financial-analytics" className="btn-secondary text-sm">Financial Analytics</Link>
        </div>
        <RevenueCenter />
      </div>
    </div>
  );
}
