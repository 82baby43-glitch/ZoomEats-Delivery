"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import PartnerBadge from "@/components/restaurants/PartnerBadge";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { Building2, CheckCircle2, Sparkles, XCircle } from "lucide-react";

export default function AdminRestaurantPartners() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === "claimed") params.filter = "claimed";
      if (filter === "unclaimed") params.filter = "unclaimed";
      if (filter === "featured") params.filter = "featured";
      const r = await api.get("/admin/partners", { params });
      setData(r?.data || null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action, id) => {
    setBusyId(id);
    try {
      await api.post(action, action.includes("reject") ? { reason: "Rejected by admin" } : {});
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const analytics = data?.analytics || {};
  const claims = Array.isArray(data?.pending_claims) ? data.pending_claims : [];
  const restaurants = Array.isArray(data?.restaurants) ? data.restaurants : [];

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Admin</div>
            <h1 className="font-display text-4xl font-black tracking-tight flex items-center gap-2">
              <Building2 size={28} /> Restaurant Partner Management
            </h1>
          </div>
          <Link href="/admin" className="btn-secondary text-sm">Back to admin</Link>
        </div>

        <div className="card p-5 mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="partner-growth-dashboard">
          {[
            ["Listed", analytics.total_listed ?? 0],
            ["Claimed", analytics.total_claimed ?? 0],
            ["Verified", analytics.verified_partners ?? 0],
            ["Featured", analytics.featured_partners ?? 0],
            ["Pending claims", analytics.pending_claims ?? 0],
            ["Conversion", `${analytics.claim_conversion_rate ?? 0}%`],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{label}</div>
              <div className="font-display text-2xl font-black mt-1">{val}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-6">
          {[
            ["all", "All restaurants"],
            ["claimed", "Claimed"],
            ["unclaimed", "Unclaimed opportunities"],
            ["featured", "Featured partners"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`badge ${filter === id ? "ring-2 ring-[var(--primary)]" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <div className="mt-6"><LoadingSkeleton label="Loading partners…" rows={4} /></div>}
        {error && <div className="mt-6"><ErrorState title="Could not load partner data" onRetry={load} /></div>}

        {!loading && !error && (
          <>
            <div className="mt-8">
              <h2 className="font-display text-xl font-bold mb-4">Pending claims</h2>
              {claims.length === 0 ? (
                <div className="card p-5 text-sm" style={{ color: "var(--muted)" }}>No pending restaurant claims.</div>
              ) : (
                <div className="space-y-4">
                  {claims.map((claim) => (
                    <div key={claim.id} className="card p-5 flex flex-wrap justify-between gap-4">
                      <div>
                        <div className="font-display text-xl font-bold">{claim.restaurant?.name || claim.restaurant_id}</div>
                        <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                          {claim.owner_name} · {claim.business_email} · {claim.phone || "No phone"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary !py-2 text-sm flex items-center gap-1"
                          disabled={busyId === claim.id}
                          onClick={() => runAction(`/admin/restaurant-claims/${claim.id}/approve`, claim.id)}
                        >
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button
                          type="button"
                          className="btn-secondary !py-2 text-sm flex items-center gap-1"
                          disabled={busyId === claim.id}
                          onClick={() => runAction(`/admin/restaurant-claims/${claim.id}/reject`, claim.id)}
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-10">
              <h2 className="font-display text-xl font-bold mb-4">Restaurants</h2>
              <div className="space-y-3">
                {restaurants.map((restaurant) => (
                  <div key={restaurant.restaurant_id} className="card p-4 flex flex-wrap justify-between gap-4">
                    <div>
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        {restaurant.name}
                        <PartnerBadge status={restaurant.partner_status} />
                      </div>
                      <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                        {[restaurant.address, restaurant.city, restaurant.state].filter(Boolean).join(", ")}
                        {restaurant.cuisine ? ` · ${restaurant.cuisine}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {restaurant.partner_status !== "featured_partner" && restaurant.claimed_by_user_id && (
                        <button
                          type="button"
                          className="btn-ghost !py-2 text-sm flex items-center gap-1"
                          disabled={busyId === restaurant.restaurant_id}
                          onClick={() => runAction(`/admin/restaurants/${restaurant.restaurant_id}/feature-partner`, restaurant.restaurant_id)}
                        >
                          <Sparkles size={14} /> Feature
                        </button>
                      )}
                      {(restaurant.partner_status === "featured_partner" || restaurant.partner_status === "verified_partner") && (
                        <button
                          type="button"
                          className="btn-ghost !py-2 text-sm"
                          disabled={busyId === restaurant.restaurant_id}
                          onClick={() => runAction(`/admin/restaurants/${restaurant.restaurant_id}/remove-partner`, restaurant.restaurant_id)}
                        >
                          Remove partner status
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
