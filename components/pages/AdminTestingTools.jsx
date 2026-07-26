"use client";

import Link from "next/link";
import {
  Activity,
  ChefHat,
  FlaskConical,
  MapPin,
  Truck,
} from "lucide-react";
import Header from "@/components/Header";
import MerchantNotificationAdminPanel from "@/components/admin/MerchantNotificationAdminPanel";

const TOOLS = [
  {
    href: "/admin/restaurant-simulator",
    title: "Restaurant Simulator",
    description: "End-to-end sandbox kitchen with fake restaurants, customers, drivers, orders, and payments. Never touches production data or Stripe.",
    icon: ChefHat,
    testId: "testing-tools-restaurant-simulator",
  },
  {
    href: "/admin/system-health",
    title: "System Health & Launch Audit",
    description: "Launch readiness checks, delivery simulation, and test order workflows.",
    icon: Activity,
    testId: "testing-tools-system-health",
  },
  {
    href: "/admin/founder-driver",
    title: "Driver Testing",
    description: "Founder driver mode with driver-side testing tools and offer simulation.",
    icon: Truck,
    testId: "testing-tools-founder-driver",
  },
  {
    href: "/admin/logistics",
    title: "Live Logistics Map",
    description: "Visualize driver routes, ETAs, and delivery flow across the platform.",
    icon: MapPin,
    testId: "testing-tools-logistics",
  },
];

export default function AdminTestingTools() {
  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
        <Link href="/admin" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Admin dashboard
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <FlaskConical size={28} style={{ color: "var(--primary)" }} />
          <h1 className="font-display text-3xl font-bold">Testing Tools</h1>
        </div>
        <p className="text-sm mt-3 max-w-2xl" style={{ color: "var(--muted)" }}>
          Internal admin-only sandboxes for validating order flows, logistics, and restaurant operations.
          Production restaurant accounts never see these tools.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-8">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="card p-6 block transition-transform hover:scale-[1.01]"
              data-testid={tool.testId}
            >
              <tool.icon size={24} style={{ color: "var(--primary)" }} />
              <h2 className="font-display text-xl font-bold mt-3">{tool.title}</h2>
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{tool.description}</p>
              <span className="inline-block mt-4 text-sm font-bold" style={{ color: "var(--primary)" }}>
                Open tool →
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-10">
          <MerchantNotificationAdminPanel />
        </div>
      </div>
    </div>
  );
}
