"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, Check, Store, X, FileQuestion } from "lucide-react";
import { api } from "@/lib/api";

function RoleBadge({ role }) {
  const label = role === "delivery" ? "Driver" : role === "vendor" ? "Restaurant" : role;
  const Icon = role === "delivery" ? Bike : Store;
  return (
    <span className="badge inline-flex items-center gap-1">
      <Icon size={12} /> {label}
    </span>
  );
}

export default function ApprovalsTab({ onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/approvals/pending");
      setItems(Array.isArray(r?.data) ? r.data : []);
    } catch (e) {
      console.warn("[approvals] load failed", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading pending approvals…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="card p-8 text-center" data-testid="approvals-empty">
        <Check size={32} className="mx-auto mb-3" style={{ color: "var(--primary)" }} />
        <p className="font-bold">No pending approvals</p>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          New drivers and restaurants will appear here after they sign up and complete agreements.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="approvals-list">
      {items.map((item) => {
        const busy = acting?.startsWith(item.user_id);
        const agreementsDone = Boolean(item.agreement_complete);
        return (
          <div key={item.user_id} className="card p-5" data-testid={`approval-${item.user_id}`}>
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
                    <RoleBadge role={item.role} />
                  </div>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{item.email}</p>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    <span className="badge">Status: {item.approval_status}</span>
                    <span className={`badge ${agreementsDone ? "text-green-400" : "text-amber-400"}`}>
                      Agreements: {agreementsDone ? "complete" : "incomplete"}
                    </span>
                    {item.restaurant?.name && (
                      <span className="badge">Store: {item.restaurant.name}</span>
                    )}
                    {item.driver && (
                      <span className="badge">Driver profile ready</span>
                    )}
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                    Joined {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  className="btn-primary !py-2 inline-flex items-center gap-1"
                  disabled={busy}
                  onClick={() => act(item.user_id, "approve")}
                  data-testid={`approve-user-${item.user_id}`}
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
