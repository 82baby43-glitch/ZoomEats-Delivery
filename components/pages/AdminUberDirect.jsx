"use client";

import Header from "@/components/Header";
import Link from "next/link";
import AdminUberDirectDashboard from "@/components/admin/AdminUberDirectDashboard";

export default function AdminUberDirect() {
  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Uber Direct</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Monitor connection status, run live API tests, and view Uber courier deliveries.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Admin dashboard</Link>
        </div>
        <AdminUberDirectDashboard />
      </div>
    </div>
  );
}
