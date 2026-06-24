import { timeAgo } from "@/components/admin/utils";

export default function AttentionTab({ attention, onApprove }) {
  return (
    <div className="space-y-6">
      <div className="card p-6" data-testid="pending-approvals">
        <h3 className="font-display text-xl font-bold mb-3">
          Pending restaurant approvals · {attention.counts.pending}
        </h3>
        {attention.pending_restaurants.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>None right now.</p>
        ) : (
          <div className="space-y-3">
            {attention.pending_restaurants.map((r) => (
              <div key={r.restaurant_id} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <img src={r.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="font-bold">{r.name}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>{r.cuisine} · {r.address}</div>
                </div>
                <button className="btn-primary !py-2" onClick={() => onApprove(r.restaurant_id)} data-testid={`approve-${r.restaurant_id}`}>
                  Approve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6" data-testid="stuck-orders">
        <h3 className="font-display text-xl font-bold mb-3">Stuck orders · {attention.counts.stuck}</h3>
        {attention.stuck_orders.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>None — all paid orders are progressing on time.</p>
        ) : (
          <div className="space-y-2">
            {attention.stuck_orders.map((o) => (
              <div key={o.order_id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <div>
                  <div className="font-bold">${o.total.toFixed(2)} · {o.restaurant_name}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>{o.customer_name} · {o.status} · {timeAgo(o.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6" data-testid="failed-payments">
        <h3 className="font-display text-xl font-bold mb-3">Failed payments · {attention.counts.failed}</h3>
        {attention.failed_payments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>None.</p>
        ) : (
          <div className="space-y-2">
            {attention.failed_payments.map((p) => (
              <div key={p.session_id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <div>
                  <div className="font-bold">${(p.amount || 0).toFixed(2)} · {p.user_id}</div>
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
