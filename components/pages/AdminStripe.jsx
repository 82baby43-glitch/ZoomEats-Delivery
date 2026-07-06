"use client";

import Header from "@/components/Header";
import Link from "next/link";
import AdminStripeDashboard from "@/components/admin/AdminStripeDashboard";

export default function AdminStripe() {
  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Stripe</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Monitor payments, platform orders, and Stripe connection health.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin dashboard</Link>
        </div>
        <AdminStripeDashboard />
      </div>
    </div>
  );
}
