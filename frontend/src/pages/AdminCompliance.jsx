import React, { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

export default function AdminCompliance() {
  const [reviews, setReviews] = useState([]);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const r = await api.get("/admin/compliance/reviews");
      setReviews(r.data || []);
    } catch (e) { console.warn(e); }
  };

  const act = async (id, action) => {
    const res = await api.post(`/admin/compliance/reviews/${id}/action`, { action });
    alert(`Action: ${res.data.status}`);
    load();
  };

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="font-display text-2xl font-bold">Compliance Reviews</h1>
        <div className="mt-6 space-y-3">
          {reviews.map((r) => (
            <div key={r.review_id} className="card p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{r.user_id}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>{r.status} · {new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => act(r.review_id, 'approve')}>Approve</button>
                <button className="btn-ghost" onClick={() => act(r.review_id, 'reject')}>Reject</button>
                <button className="btn-ghost" onClick={() => act(r.review_id, 'request_info')}>Request Info</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
