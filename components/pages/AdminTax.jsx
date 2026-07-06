"use client";

import Header from "@/components/Header";
import Link from "next/link";
import AdminTaxDashboard from "@/components/admin/AdminTaxDashboard";

export default function AdminTax() {
  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Tax &amp; Year-End Reporting</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Contractor payment totals, W-9 status, 1099-NEC exports, and IRS-ready CSV by tax year.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/compliance" className="btn-ghost text-sm">Compliance</Link>
            <Link href="/admin" className="btn-ghost text-sm">← Admin</Link>
          </div>
        </div>
        <AdminTaxDashboard />
      </div>
    </div>
  );
}
