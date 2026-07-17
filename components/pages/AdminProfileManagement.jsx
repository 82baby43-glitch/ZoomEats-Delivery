"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import UserAvatar from "@/components/profile/UserAvatar";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { Shield, Search } from "lucide-react";

export default function AdminProfileManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (missingOnly) params.missing_photo = "1";
      const r = await api.get("/admin/profiles", { params });
      setRows(Array.isArray(r?.data) ? r.data : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, missingOnly]);

  useEffect(() => { load(); }, [load]);

  const moderate = async (userId, status) => {
    setBusyId(userId);
    try {
      await api.post(`/admin/profiles/${userId}/moderate`, { status });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Admin</div>
            <h1 className="font-display text-4xl font-black tracking-tight flex items-center gap-2">
              <Shield size={28} /> Profile & Vehicle Moderation
            </h1>
          </div>
          <Link href="/admin" className="btn-secondary text-sm">Back to admin</Link>
        </div>

        <div className="card p-4 mt-6 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
            <input className="input-field w-full pl-9" placeholder="Search customer, driver, restaurant, vehicle…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
            Missing profile photos only
          </label>
          <button type="button" className="btn-primary !py-2 text-sm" onClick={load}>Search</button>
        </div>

        {loading && <div className="mt-6"><LoadingSkeleton label="Loading profiles…" rows={5} /></div>}
        {error && <div className="mt-6"><ErrorState title="Could not load profiles" onRetry={load} /></div>}

        <div className="mt-6 space-y-4">
          {rows.map((row) => (
            <div key={row.user_id} className="card p-4 flex flex-wrap gap-4 justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <UserAvatar name={row.name} src={row.thumbnail_photo_url || row.profile_photo_url} size={56} />
                <div>
                  <div className="font-bold">{row.name || row.email}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>{row.email} · {row.role}</div>
                  <div className="text-xs mt-1 flex flex-wrap gap-2">
                    {row.missing_profile_photo && <span className="badge text-amber-400">Missing profile photo</span>}
                    {row.profile_photo_status && row.profile_photo_status !== "approved" && (
                      <span className="badge">{row.profile_photo_status}</span>
                    )}
                  </div>
                  {row.vehicles?.length > 0 && (
                    <div className="text-xs mt-2 space-y-1" style={{ color: "var(--muted)" }}>
                      {row.vehicles.map((v) => (
                        <div key={v.id}>
                          {[v.color, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}
                          {v.missing_front_photo ? " · missing front photo" : ""}
                          {v.is_active ? " · active" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost !py-2 text-sm" disabled={busyId === row.user_id} onClick={() => moderate(row.user_id, "approved")}>Approve photo</button>
                <button type="button" className="btn-ghost !py-2 text-sm text-red-400" disabled={busyId === row.user_id} onClick={() => moderate(row.user_id, "rejected")}>Reject photo</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
