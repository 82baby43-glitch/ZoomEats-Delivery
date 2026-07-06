"use client";

import { useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { logClientError } from "@/lib/clientErrorLog";

export default function GeocodeRestaurantsButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const run = async () => {
    setLoading(true);
    setMessage("");
    try {
      const r = await api.post("/admin/geocode-restaurants");
      const d = r?.data;
      if (d && typeof d === "object") {
        setMessage(`Geocoded ${d.geocoded ?? 0}, skipped ${d.skipped ?? 0}, failed ${d.failed ?? 0}`);
      }
    } catch (e) {
      logClientError("admin.geocode-restaurants", e);
      setMessage("Geocode failed — check console");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost inline-flex items-center gap-2 text-sm"
        onClick={run}
        disabled={loading}
        data-testid="admin-geocode-restaurants"
      >
        <MapPin size={16} />
        {loading ? <RefreshCw size={14} className="animate-spin" /> : null}
        Geocode restaurants
      </button>
      {message && <span className="text-xs" style={{ color: "var(--muted)" }}>{message}</span>}
    </div>
  );
}
