"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Star,
  Store,
  XCircle,
} from "lucide-react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { businessCategoryLabel } from "@/lib/merchant/googleCategoryMap";
import { LoadingSkeleton } from "@/components/ui/PageStates";

const STATUS_LABELS = {
  pending_verification: "Pending Verification",
  claim_requested: "Claim Requested",
  verified_local_partner: "Verified",
  rejected: "Rejected",
};

export default function AdminMerchantClaims() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (category) params.category = category;
      if (q) params.q = q;
      const res = await api.get("/admin/merchant-claims", { params });
      setClaims(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } finally {
      setLoading(false);
    }
  }, [status, category, q]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (claimId, action) => {
    setBusy(claimId + action);
    try {
      if (action === "approve") await api.post(`/admin/merchant-claims/${claimId}/approve`);
      if (action === "reject") await api.post(`/admin/merchant-claims/${claimId}/reject`);
      if (action === "feature") {
        const claim = claims.find((c) => c.claim_id === claimId);
        const rest = claim?.restaurants;
        if (rest?.restaurant_id) {
          await api.patch(`/admin/merchant-claims/restaurants/${rest.restaurant_id}`, {
            is_featured_partner: !rest.is_featured_partner,
          });
        }
      }
      await load();
    } catch (e) {
      alert(e?.message || "Action failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <Link href="/admin" className="text-sm" style={{ color: "var(--muted)" }}>← Admin dashboard</Link>
        <h1 className="font-display text-3xl font-bold mt-2 flex items-center gap-3">
          <Store size={28} /> Local Merchant Management
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          Review Google Places claim requests, manage categories, and feature local partners in Spotlight.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold">Status</label>
            <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="verified_local_partner">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold">Category</label>
            <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              <option value="restaurant">Restaurant</option>
              <option value="liquor_store">Liquor Store</option>
              <option value="convenience_store">Convenience Store</option>
              <option value="grocery_store">Grocery</option>
              <option value="retail">Retail</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold">Search</label>
            <input className="input mt-1 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, address, email..." />
          </div>
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
          <Link href="/admin/spotlight" className="btn-secondary text-sm inline-flex items-center gap-2">
            <Star size={14} /> Manage Spotlight
          </Link>
        </div>

        {loading ? (
          <div className="mt-8"><LoadingSkeleton rows={5} /></div>
        ) : (
          <div className="mt-8 space-y-4">
            {claims.length === 0 ? (
              <div className="card p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                No merchant claims found.
              </div>
            ) : (
              claims.map((claim) => {
                const rest = claim.restaurants || {};
                const user = claim.users || {};
                return (
                  <div key={claim.claim_id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-lg">{rest.name || "Business"}</div>
                        <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{rest.address}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="badge">{businessCategoryLabel(rest.business_category)}</span>
                          <span className="badge">{STATUS_LABELS[claim.status] || claim.status}</span>
                          {rest.is_featured_partner && <span className="badge">Featured Partner</span>}
                          {rest.is_local_partner && <span className="badge">Local Partner</span>}
                        </div>
                        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                          Claimant: {user.name || user.email || claim.user_id}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {claim.status === "pending_verification" && (
                          <>
                            <button
                              type="button"
                              className="btn-primary text-sm inline-flex items-center gap-1"
                              disabled={!!busy}
                              onClick={() => act(claim.claim_id, "approve")}
                            >
                              {busy === claim.claim_id + "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-sm inline-flex items-center gap-1"
                              disabled={!!busy}
                              onClick={() => act(claim.claim_id, "reject")}
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          disabled={!!busy}
                          onClick={() => act(claim.claim_id, "feature")}
                        >
                          {rest.is_featured_partner ? "Unfeature" : "Feature"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
