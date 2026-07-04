"use client";

import { timeAgo } from "@/components/admin/utils";
import { formatMoney, sanitizeAttention } from "@/lib/safeData";

export default function AttentionTab({ attention, onApprove }) {
  const safe = sanitizeAttention(attention);
  const { pending_restaurants, stuck_orders, failed_payments, counts } = safe;

  return (
    <div className="space-y-6">
      <div className="card p-6" data-testid="pending-approvals">
        <h3 className="font-display text-xl font-bold mb-3">
          Pending restaurant approvals · {counts.pending}
        </h3>
        {pending_restaurants.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>None right now.</p>
        ) : (
          <div className="space-y-3">
            {pending_restaurants.map((r) => (
              <div key={r.restaurant_id || r.name} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                {r.image_url ? (
                  <img src={r.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-lg" style={{ background: "var(--border)" }} />
                )}
                <div className="flex-1">
                  <div className="font-bold">{r.name}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>{r.cuisine || "—"} · {r.address || "—"}</div>
                </div>
                <button className="btn-primary !py-2" onClick={() => onApprove?.(r.restaurant_id)} data-testid={`approve-${r.restaurant_id}`}>
                  Approve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6" data-testid="stuck-orders">
        <h3 className="font-display text-xl font-bold mb-3">Stuck orders · {counts.stuck}</h3>
        {stuck_orders.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>None — all paid orders are progressing on time.</p>
        ) : (
          <div className="space-y-2">
            {stuck_orders.map((o) => (
              <div key={o.order_id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <div>
                  <div className="font-bold">${formatMoney(o.total)} · {o.restaurant_name}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    {o.customer_name} · {o.status} · {o.payment_status ?? "pending"} · {timeAgo(o.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6" data-testid="failed-payments">
        <h3 className="font-display text-xl font-bold mb-3">Failed payments · {counts.failed}</h3>
        {failed_payments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>None.</p>
        ) : (
          <div className="space-y-2">
            {failed_payments.map((p) => (
              <div key={p.session_id || `${p.user_id}-${p.created_at}`} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <div>
                  <div className="font-bold">${formatMoney(p.amount)} · {p.user_id || "unknown"}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>{p.payment_status} · {timeAgo(p.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
