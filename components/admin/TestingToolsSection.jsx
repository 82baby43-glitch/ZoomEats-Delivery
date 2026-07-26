"use client";

import Link from "next/link";
import { Activity, ChefHat, MapPin, Truck } from "lucide-react";
import DeliverySimulationPanel from "@/components/admin/DeliverySimulationPanel";
import MerchantNotificationAdminPanel from "@/components/admin/MerchantNotificationAdminPanel";

const SANDBOX_TOOLS = [
  {
    href: "/admin/restaurant-simulator",
    title: "Restaurant Simulator",
    description: "Sandbox kitchen with fake restaurants, customers, drivers, orders, and payments. Never touches production data or Stripe.",
    icon: ChefHat,
    testId: "testing-tools-restaurant-simulator",
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

export default function TestingToolsSection() {
  return (
    <div className="space-y-10" data-testid="testing-tools-section">
      <div>
        <h2 className="font-display text-xl font-bold">Sandbox tools</h2>
        <p className="text-sm mt-1 max-w-2xl" style={{ color: "var(--muted)" }}>
          Internal admin-only environments for validating order flows, logistics, and restaurant operations.
        </p>
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {SANDBOX_TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="card p-6 block transition-transform hover:scale-[1.01]"
              data-testid={tool.testId}
            >
              <tool.icon size={24} style={{ color: "var(--primary)" }} />
              <h3 className="font-bold mt-3">{tool.title}</h3>
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{tool.description}</p>
              <span className="inline-block mt-4 text-sm font-bold" style={{ color: "var(--primary)" }}>
                Open tool →
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={20} style={{ color: "var(--primary)" }} />
          <h2 className="font-display text-xl font-bold">Flow simulations</h2>
        </div>
        <DeliverySimulationPanel />
      </div>

      <div>
        <MerchantNotificationAdminPanel />
      </div>
    </div>
  );
}
