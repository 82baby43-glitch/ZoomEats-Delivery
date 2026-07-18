"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, Check, Store, X, FileQuestion, Shield, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";

const ENDPOINTS = {
  drivers: "/admin/approvals/drivers",
  restaurants: "/admin/approvals/restaurants",
};

const FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "all", label: "All" },
];

function PartnerIcon({ partnerType }) {
  return partnerType === "drivers" ? <Bike size={12} /> : <Store size={12} />;
}

export default function PartnerApprovalsPanel({
  partnerType = "drivers",
  onChanged,
  onReview,
}) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(ENDPOINTS[partnerType], { params: { status: filter } });
      setItems(Array.isArray(r?.data) ? r.data : []);
    } catch (e) {
      console.warn(`[${partnerType}] load failed`, e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [partnerType, filter]);

  useEffect(() => { load(); }, [load]);

  const act = async (userId, action) => {
    setActing(`${userId}:${action}`);
    try {
      await api.post(`/admin/approvals/users/${userId}/action`, { action });
      await load();
      onChanged?.();
    } catch (e) {
      alert(e?.message || "Action failed");
    } finally {
      setActing(null);
    }
  };

  const label = partnerType === "drivers" ? "Driver" : "Restaurant";
  const emptyCopy = filter === "approved"
    ? `No approved ${partnerType} yet.`
    : filter === "pending"
      ? `No pending ${partnerType}. New partners appear here after signup and agreements.`
      : `No ${partnerType} found.`;

  return (
    <div className="space-y-4" data-testid={`partner-approvals-${partnerType}`}>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${filter === f.id ? "btn-primary" : "btn-ghost"}`}
            data-testid={`${partnerType}-filter-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading {partnerType}…</p>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-bold">No {partnerType}</p>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{emptyCopy}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const busy = acting?.startsWith(item.user_id);
            const approved = item.approval_status === "approved";
            const agreementsDone = Boolean(item.agreement_complete);
            return (
              <div key={item.user_id} className="card p-5" data-testid={`partner-${partnerType}-${item.user_id}`}>
                <div className="flex flex-wrap items-start gap-4 justify-between">
                  <div className="flex items-start gap-4 min-w-0">
                    {item.picture ? (
                      <img src={item.picture} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-full shrink-0" style={{ background: "var(--surface-2)" }} />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-lg">{item.name}</h3>
                        <span className="badge inline-flex items-center gap-1">
                          <PartnerIcon partnerType={partnerType} /> {label}
                        </span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{item.email}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs">
                        <span className={`badge ${approved ? "text-green-400" : "text-amber-400"}`}>
                          Status: {item.approval_status}
                        </span>
                        <span className={`badge ${agreementsDone ? "text-green-400" : "text-amber-400"}`}>
                          Agreements: {agreementsDone ? "complete" : "incomplete"}
                        </span>
                        {item.restaurant?.merchant_category_slug === "licensed_dispensary" && (
                          <span className="badge" style={{ color: "var(--primary)" }}>🌿 Licensed Dispensary</span>
                        )}
                        {item.restaurant?.name && (
                          <span className="badge">Store: {item.restaurant.name}</span>
                        )}
                        {item.driver && (
                          <span className="badge">
                            Driver profile {item.driver.approval_status === "approved" ? "approved" : "on file"}
                          </span>
                        )}
                        {item.review?.reviewed_at && (
                          <span className="badge">
                            Reviewed {new Date(item.review.reviewed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                        Joined {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      className="btn-ghost !py-2 inline-flex items-center gap-1"
                      onClick={() => onReview?.(item.user_id)}
                      data-testid={`review-${partnerType}-${item.user_id}`}
                    >
                      <Shield size={16} /> Compliance
                    </button>
                    {!approved ? (
                      <>
                        <button
                          className="btn-primary !py-2 inline-flex items-center gap-1"
                          disabled={busy}
                          onClick={() => act(item.user_id, "approve")}
                          data-testid={`approve-${partnerType}-${item.user_id}`}
                        >
                          <Check size={16} /> Approve
                        </button>
                        <button
                          className="btn-ghost !py-2 inline-flex items-center gap-1"
                          disabled={busy}
                          onClick={() => act(item.user_id, "request_info")}
                        >
                          <FileQuestion size={16} /> Request info
                        </button>
                        <button
                          className="btn-ghost !py-2 inline-flex items-center gap-1 text-red-400"
                          disabled={busy}
                          onClick={() => act(item.user_id, "reject")}
                        >
                          <X size={16} /> Reject
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-ghost !py-2 inline-flex items-center gap-1 text-amber-400"
                        disabled={busy}
                        onClick={() => act(item.user_id, "revoke")}
                        data-testid={`revoke-${partnerType}-${item.user_id}`}
                      >
                        <RotateCcw size={16} /> Revoke approval
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
