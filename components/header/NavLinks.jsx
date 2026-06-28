"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Bike, Shield } from "lucide-react";
import { api } from "@/lib/api";

function AdminLink({ role }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (role !== "admin") { setCount(0); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.get("/admin/attention");
        if (!cancelled) {
          const c = r.data.counts;
          setCount((c.pending || 0) + (c.stuck || 0) + (c.failed || 0));
        }
      } catch (e) {
        if (!cancelled) console.warn("[header] attention poll failed:", e);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [role]);

  return (
    <Link href="/admin" className="btn-ghost flex items-center gap-2 relative" data-testid="nav-admin">
      <Shield size={16} /> Admin
      {count > 0 && (
        <span
          className="text-xs font-bold rounded-full px-1.5 min-w-[20px] h-5 inline-flex items-center justify-center"
          style={{ background: "var(--primary)", color: "#0A0A0A" }}
          data-testid="nav-admin-badge"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export default function NavLinks({ user }) {
  return (
    <nav className="hidden md:flex items-center gap-6">
      <Link href="/" className="btn-ghost" data-testid="nav-home">Discover</Link>
      {user && <Link href="/orders" className="btn-ghost" data-testid="nav-orders">My Orders</Link>}
      {user?.role === "vendor" && (
        <Link href="/vendor" className="btn-ghost flex items-center gap-2" data-testid="nav-vendor">
          <LayoutDashboard size={16} /> Vendor
        </Link>
      )}
      {user?.role === "delivery" && (
        <Link href="/delivery" className="btn-ghost flex items-center gap-2" data-testid="nav-delivery">
          <Bike size={16} /> Delivery
        </Link>
      )}
      {user?.role === "admin" && <AdminLink role={user.role} />}
    </nav>
  );
}
