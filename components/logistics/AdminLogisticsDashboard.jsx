"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import LogisticsMap from "@/components/maps/LogisticsMap";
import { useLogisticsPoll } from "@/lib/hooks/useLogisticsRealtime";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";

export default function AdminLogisticsDashboard() {
  const fetchAdmin = useCallback(() => api.get("/logistics/admin"), []);
  const { data, loading, error, reload } = useLogisticsPoll(fetchAdmin, "admin", 10000);

  if (loading && !data) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading network map…" rows={3} /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12"><ErrorState title="Logistics unavailable" onRetry={reload} /></div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="label-eyebrow">Admin observability</div>
        <h1 className="font-display text-3xl font-black mb-6">Network Live Map</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-4"><div className="text-xs" style={{ color: "var(--muted)" }}>Drivers online</div><div className="text-2xl font-black">{data?.drivers_online ?? 0}</div></div>
          <div className="card p-4"><div className="text-xs" style={{ color: "var(--muted)" }}>Active orders</div><div className="text-2xl font-black">{data?.active_orders ?? 0}</div></div>
          <div className="card p-4"><div className="text-xs" style={{ color: "var(--muted)" }}>Utilization</div><div className="text-2xl font-black">{data?.driver_utilization_pct ?? 0}%</div></div>
          <div className="card p-4"><div className="text-xs" style={{ color: "var(--muted)" }}>Avg wait</div><div className="text-2xl font-black">{data?.avg_wait_min ?? 0}m</div></div>
        </div>
        <LogisticsMap markers={data?.markers || []} routes={[]} height={520} />
        {(data?.bottlenecks || []).length > 0 && (
          <div className="card p-4 mt-4 text-sm">
            <strong>Bottlenecks:</strong> {data.bottlenecks.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
