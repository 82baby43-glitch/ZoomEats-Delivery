"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/safeData";
import { BarChart3, Clock, DollarSign, ShoppingBag, TrendingUp, XCircle } from "lucide-react";
import { LoadingSkeleton } from "@/components/ui/PageStates";

export default function RestaurantAnalyticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/vendor/analytics")
      .then((r) => setData(r?.data || r))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={4} label="Loading analytics…" />;
  if (!data) return <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>Analytics unavailable.</div>;

  const maxHour = Math.max(...(data.orders_by_hour || [1]), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today", value: `$${formatMoney(data.sales_today)}`, icon: DollarSign },
          { label: "This week", value: `$${formatMoney(data.sales_week)}`, icon: TrendingUp },
          { label: "This month", value: `$${formatMoney(data.sales_month)}`, icon: BarChart3 },
          { label: "Avg ticket", value: `$${formatMoney(data.avg_ticket_size)}`, icon: ShoppingBag },
        ].map((tile) => (
          <div key={tile.label} className="card p-4">
            <tile.icon size={16} style={{ color: "var(--primary)" }} />
            <div className="text-xs mt-2 uppercase" style={{ color: "var(--muted)" }}>{tile.label}</div>
            <div className="font-display text-2xl font-bold mt-1">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Completed orders</div>
          <div className="text-3xl font-bold mt-1">{data.completed_orders}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <XCircle size={12} /> Cancelled
          </div>
          <div className="text-3xl font-bold mt-1">{data.cancelled_orders}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <Clock size={12} /> Avg prep time
          </div>
          <div className="text-3xl font-bold mt-1">
            {data.avg_prep_time_min != null ? `${data.avg_prep_time_min}m` : "—"}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-bold mb-4">Best-selling items</h3>
          <ul className="space-y-2">
            {(data.best_selling_items || []).map((item) => (
              <li key={item.name} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span style={{ color: "var(--muted)" }}>{item.count} sold</span>
              </li>
            ))}
            {!(data.best_selling_items || []).length && (
              <li className="text-sm" style={{ color: "var(--muted)" }}>No sales data yet.</li>
            )}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="font-bold mb-4">Peak ordering hours</h3>
          <div className="flex items-end gap-1 h-32">
            {(data.orders_by_hour || []).map((count, hour) => (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(4, (count / maxHour) * 100)}%`,
                    background: hour === data.peak_ordering_hour ? "var(--primary)" : "var(--border)",
                  }}
                  title={`${hour}:00 — ${count} orders`}
                />
                <span className="text-[9px]" style={{ color: "var(--muted)" }}>{hour % 6 === 0 ? `${hour}h` : ""}</span>
              </div>
            ))}
          </div>
          {data.peak_ordering_hour != null && (
            <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
              Busiest hour: {data.peak_ordering_hour}:00
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
