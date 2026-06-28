"use client";

export function UsersTable({ users }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Email</th>
            <th className="text-left p-3">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="p-3 font-bold">{u.name}</td>
              <td className="p-3">{u.email}</td>
              <td className="p-3"><span className="badge">{u.role}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RestaurantsList({ restaurants, onApprove }) {
  return (
    <div className="space-y-3">
      {restaurants.map((r) => (
        <div key={r.restaurant_id} className="card p-4 flex items-center gap-4" data-testid={`admin-rest-${r.restaurant_id}`}>
          <img src={r.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
          <div className="flex-1">
            <div className="font-bold">{r.name}</div>
            <div className="text-sm" style={{ color: "var(--muted)" }}>{r.cuisine} · {r.address}</div>
          </div>
          {r.approved ? (
            <span className="badge">Approved</span>
          ) : (
            <button className="btn-primary !py-2" onClick={() => onApprove(r.restaurant_id)} data-testid={`approve-${r.restaurant_id}`}>
              Approve
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function OrdersTable({ orders }) {
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
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.order_id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="p-3 font-mono">#{o.order_id.slice(-6)}</td>
              <td className="p-3">{o.restaurant_name}</td>
              <td className="p-3">{o.customer_name}</td>
              <td className="p-3 text-right font-bold">${o.total.toFixed(2)}</td>
              <td className="p-3"><span className="badge">{o.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
