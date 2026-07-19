"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import DriverEarningsBreakdown from "@/components/driver/DriverEarningsBreakdown";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { DollarSign, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/safeData";
import { logClientError } from "@/lib/clientErrorLog";

export default function DriverEarningsPage() {
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/driver/earnings");
      setSummary(res?.data || null);
      setError(false);
    } catch (e) {
      logClientError("driver.earnings.load", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openOrder = async (orderId) => {
    setSelected(orderId);
    setDetailLoading(true);
    try {
      const res = await api.get(`/driver/earnings/orders/${orderId}`);
      setDetail(res?.data || null);
    } catch (e) {
      logClientError("driver.earnings.detail", e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading earnings…" rows={4} /></div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-12">
          <ErrorState title="Could not load earnings" onRetry={load} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tighter flex items-center gap-3">
              <DollarSign size={32} /> Driver Earnings
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Transparent pay breakdown — base, mileage, time, peak, tips, and bonuses
            </p>
          </div>
          <Link href="/driver/live-map" className="btn-ghost text-sm">← Live map</Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-4">
            <div className="text-sm" style={{ color: "var(--muted)" }}>Today</div>
            <div className="font-display text-2xl font-bold">${formatMoney(summary?.today)}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm" style={{ color: "var(--muted)" }}>This week</div>
            <div className="font-display text-2xl font-bold">${formatMoney(summary?.week)}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm flex items-center gap-1" style={{ color: "var(--muted)" }}>
              <TrendingUp size={14} /> Effective $/hr
            </div>
            <div className="font-display text-2xl font-bold">${formatMoney(summary?.effective_hourly)}</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-8 text-sm">
          <div className="card p-4 flex justify-between"><span>Tips</span><strong>${formatMoney(summary?.tips)}</strong></div>
          <div className="card p-4 flex justify-between"><span>Bonuses</span><strong>${formatMoney(summary?.bonuses)}</strong></div>
          <div className="card p-4 flex justify-between"><span>Deliveries today</span><strong>{summary?.deliveries_completed ?? 0}</strong></div>
          <div className="card p-4 flex justify-between"><span>Online time</span><strong>{summary?.online_minutes ?? 0}m</strong></div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card p-5">
            <h2 className="font-display text-lg font-bold mb-4">Recent deliveries</h2>
            <div className="space-y-2">
              {(summary?.recent || []).length === 0 && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No completed deliveries yet.</p>
              )}
              {(summary?.recent || []).map((row) => (
                <button
                  key={row.order_id}
                  type="button"
                  className="w-full text-left rounded-xl border p-3 text-sm hover:border-[var(--primary)] transition-colors"
                  style={{ borderColor: selected === row.order_id ? "var(--primary)" : "var(--border)" }}
                  onClick={() => openOrder(row.order_id)}
                  data-testid={`earnings-order-${row.order_id}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs">{row.order_id}</span>
                    <strong>${formatMoney(row.final_driver_pay)}</strong>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Tip ${formatMoney(row.customer_tip)} · {new Date(row.created_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-bold mb-4">Order breakdown</h2>
            {detailLoading && <LoadingSkeleton label="Loading breakdown…" rows={3} />}
            {!detailLoading && !detail && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Select a delivery to see the full earnings breakdown.</p>
            )}
            {!detailLoading && detail && (
              <DriverEarningsBreakdown
                breakdown={detail.breakdown}
                lines={detail.lines}
                source={detail.source}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
