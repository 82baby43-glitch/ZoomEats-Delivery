"use client";

import { formatMoney, safeOrderId, sanitizeUsers, sanitizeRestaurants, sanitizeOrders } from "@/lib/safeData";
import { EmptyState } from "@/components/ui/PageStates";

export function UsersTable({ users }) {
  const rows = sanitizeUsers(users);

  if (rows.length === 0) {
    return <EmptyState title="No users" description="User data will appear here once people sign up." />;
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Email</th>
            <th className="text-left p-3">Role</th>
            <th className="text-left p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.user_id || u.email} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="p-3 font-bold">{u.name}</td>
              <td className="p-3">{u.email}</td>
              <td className="p-3"><span className="badge">{u.role}</span></td>
              <td className="p-3">
                <span className={`badge ${u.approval_status === "approved" ? "text-green-400" : "text-amber-400"}`}>
                  {u.approval_status || "approved"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RestaurantsList({ restaurants, onApprove, onEditLocation }) {
  const rows = sanitizeRestaurants(restaurants);

  if (rows.length === 0) {
    return <EmptyState title="No restaurants" description="Restaurants will appear here once vendors register." />;
  }

  const statusLabel = (r) => {
    if (!r.approved) return "Pending approval";
    if (r.launch_status === "pending_location") return "Pending Location";
    if (r.launch_status === "pending_menu") return "Pending Menu Setup";
    if (r.launch_status === "pending_payout") return "Pending Stripe Payout";
    if (r.accepting_orders) return "Active";
    return r.launch_status === "ready" ? "Ready" : "Approved";
  };

  const stripeLabel = (r) => {
    if (r.stripe_payout_ready) return { text: "YES", cls: "badge-success" };
    if (r.stripe_connected) return { text: "PARTIAL", cls: "badge-warn" };
    return { text: "NO", cls: "badge-error" };
  };

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.restaurant_id || r.name} className="card p-4 flex items-center gap-4" data-testid={`admin-rest-${r.restaurant_id}`}>
          {r.image_url ? (
            <img src={r.image_url} alt={r.name || "Restaurant"} className="w-16 h-16 rounded-xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-xl" style={{ background: "var(--surface-2)" }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-bold">{r.name}</div>
              {r.import_source && (
                <span className="badge uppercase text-[10px]">{r.import_source}</span>
              )}
              <span className={`badge text-[10px] ${r.accepting_orders ? "text-green-400" : "text-amber-400"}`}>
                {statusLabel(r)}
              </span>
            </div>
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              {r.cuisine || "—"} · {r.address || "—"}
              {r.latitude && r.longitude ? ` · 📍 ${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}` : " · No coordinates"}
            </div>
            <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
              <span>Stripe Connected:</span>
              <span className={`badge text-[10px] ${stripeLabel(r).cls}`}>{stripeLabel(r).text}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onEditLocation?.(r.restaurant_id)}>
              Location
            </button>
            {r.approved ? (
              <span className="badge text-center">Approved</span>
            ) : (
              <button className="btn-primary !py-2" onClick={() => onApprove?.(r.restaurant_id)} data-testid={`approve-${r.restaurant_id}`}>
                Approve
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrdersTable({ orders }) {
  const rows = sanitizeOrders(orders);

  if (rows.length === 0) {
    return <EmptyState title="No orders" description="Orders will appear here as customers place them." />;
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <th className="text-left p-3">Order</th>
            <th className="text-left p-3">Restaurant</th>
            <th className="text-left p-3">Customer</th>
            <th className="text-right p-3">Total</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.order_id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="p-3 font-mono">#{safeOrderId(o.order_id)}</td>
              <td className="p-3">{o.restaurant_name}</td>
              <td className="p-3">{o.customer_name}</td>
              <td className="p-3 text-right font-bold">${formatMoney(o.total)}</td>
              <td className="p-3"><span className="badge">{o.status}</span></td>
              <td className="p-3"><span className="badge">{o.payment_status ?? "pending"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
