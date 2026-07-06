"use client";

import React, { useEffect, useState } from "react";
import Header from "@/components/Header";
import ApprovalsTab from "@/components/admin/ApprovalsTab";
import Link from "next/link";

export default function AdminCompliance() {
  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Driver & Restaurant Approvals</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Review and approve new drivers and restaurant partners.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">← Back to Admin</Link>
        </div>
        <ApprovalsTab />
      </div>
    </div>
  );
}
