"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { formatMoney, sanitizeMetrics } from "@/lib/safeData";
import { LoadingSkeleton } from "@/components/ui/PageStates";

export default function PulseHeader({ since, onRefresh }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
      <div>
        <div className="label-eyebrow">Platform · Live pulse</div>
        <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Admin panel</h1>
      </div>
      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }} data-testid="pulse-status">
        <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--primary)" }} />
        Live · refreshed {since}s ago
        <button type="button" className="btn-ghost !p-2" onClick={onRefresh} data-testid="manual-refresh">
          <RefreshCw size={16} />
        </button>
      </div>
    </div>
  );
}

export function MetricsTiles({ metrics, loading }) {
  const safe = sanitizeMetrics(metrics);

  if (loading && !safe) {
    return <LoadingSkeleton label="Loading metrics…" rows={1} />;
  }

  if (!safe) return null;

  const tiles = [
    ["Users", safe.users],
    ["Restaurants", safe.restaurants],
    ["Orders", safe.orders],
    ["Paid", safe.paid_orders],
    ["Revenue", `$${formatMoney(safe.revenue)}`],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6" data-testid="admin-metrics">
      {tiles.map(([label, v]) => (
        <motion.div key={label} className="card p-5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="label-eyebrow">{label}</div>
          <div className="font-display text-2xl md:text-3xl font-black mt-1">{v}</div>
        </motion.div>
      ))}
    </div>
  );
}
