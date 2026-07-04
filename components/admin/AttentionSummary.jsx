"use client";

import { AlertTriangle } from "lucide-react";
import { safeNumber } from "@/lib/safeData";

export default function AttentionSummary({ counts, onResolve }) {
  const pending = safeNumber(counts?.pending);
  const stuck = safeNumber(counts?.stuck);
  const failed = safeNumber(counts?.failed);
  const total = pending + stuck + failed;

  return (
    <div className="card p-6" data-testid="attention-summary">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={18} style={{ color: total > 0 ? "var(--primary)" : "var(--muted)" }} />
        <h3 className="font-display text-xl font-bold">Needs attention</h3>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex justify-between"><span style={{ color: "var(--muted)" }}>Pending restaurant approvals</span><span className="font-bold">{pending}</span></li>
        <li className="flex justify-between"><span style={{ color: "var(--muted)" }}>Stuck orders (&gt; 30 min)</span><span className="font-bold">{stuck}</span></li>
        <li className="flex justify-between"><span style={{ color: "var(--muted)" }}>Failed payments</span><span className="font-bold">{failed}</span></li>
      </ul>
      {total > 0 ? (
        <button type="button" className="btn-primary w-full mt-4 !py-2" onClick={onResolve} data-testid="goto-attention">
          Resolve {total} item{total === 1 ? "" : "s"}
        </button>
      ) : (
        <div className="mt-4 text-sm font-bold" style={{ color: "var(--primary)" }}>All clear ✓</div>
      )}
    </div>
  );
}
