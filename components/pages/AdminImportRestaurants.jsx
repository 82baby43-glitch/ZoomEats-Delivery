"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { Protected } from "@/components/Protected";
import { api } from "@/lib/api";
import { logClientError } from "@/lib/clientErrorLog";

const EMPTY_PROGRESS = {
  found: 0,
  imported: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  progress_pct: 0,
  status: "idle",
};

export default function AdminImportRestaurants() {
  const [city, setCity] = useState("Columbia");
  const [state, setState] = useState("Missouri");
  const [radius, setRadius] = useState(15000);
  const [limit, setLimit] = useState(100);
  const [importing, setImporting] = useState(false);
  const [importId, setImportId] = useState(null);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (id) => {
      try {
        const r = await api.get(`/admin/import-restaurants/status/${id}`);
        const data = r?.data ?? {};
        setProgress({
          found: data.found ?? 0,
          imported: data.imported ?? 0,
          updated: data.updated ?? 0,
          skipped: data.skipped ?? 0,
          failed: data.failed ?? 0,
          progress_pct: Number(data.progress_pct ?? 0),
          status: data.status ?? "running",
        });

        if (data.status === "complete") {
          stopPolling();
          setImporting(false);
          setMessage(
            `Import complete — ${data.imported ?? 0} new, ${data.updated ?? 0} updated, ${data.failed ?? 0} failed.`
          );
        } else if (data.status === "failed") {
          stopPolling();
          setImporting(false);
          setError(data.error_message || "Import failed");
        }
      } catch (e) {
        logClientError("admin.import.poll", e, { importId: id });
      }
    },
    [stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startImport = async () => {
    setError("");
    setMessage("");
    setImporting(true);
    setProgress({ ...EMPTY_PROGRESS, status: "starting", progress_pct: 2 });

    try {
      const r = await api.post("/admin/import-restaurants", {
        city: city.trim(),
        state: state.trim(),
        radius,
        limit,
      });
      const id = r?.data?.import_id;
      if (!id) throw new Error("No import id returned");
      setImportId(id);
      setMessage("Import started…");
      pollRef.current = setInterval(() => pollStatus(id), 1200);
      await pollStatus(id);
    } catch (e) {
      setImporting(false);
      setError(e?.message || "Could not start import");
      logClientError("admin.import.start", e);
    }
  };

  const pct = Math.min(100, Math.max(0, progress.progress_pct ?? 0));

  return (
    <Protected roles={["admin"]}>
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <Link href="/admin" className="btn-ghost mb-6 inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Back to Admin
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tighter">Google Places Bulk Import</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Import restaurants for any US city. New imports are inactive until you approve them in Admin.
        </p>

        <div className="card p-6 mt-8 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="label-eyebrow">City</span>
              <input
                className="input-field mt-1"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Columbia"
                data-testid="import-city"
              />
            </label>
            <label className="block">
              <span className="label-eyebrow">State</span>
              <input
                className="input-field mt-1"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Missouri"
                data-testid="import-state"
              />
            </label>
            <label className="block">
              <span className="label-eyebrow">Search radius (meters)</span>
              <input
                className="input-field mt-1"
                type="number"
                min={500}
                max={50000}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                data-testid="import-radius"
              />
            </label>
            <label className="block">
              <span className="label-eyebrow">Restaurant limit (max 300)</span>
              <input
                className="input-field mt-1"
                type="number"
                min={1}
                max={300}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                data-testid="import-limit"
              />
            </label>
          </div>

          <button
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={startImport}
            disabled={importing || !city.trim() || !state.trim()}
            data-testid="import-start"
          >
            {importing ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            Import from Google Places
          </button>
        </div>

        {(importing || progress.status === "complete" || progress.status === "failed") && (
          <div className="card p-6 mt-6 space-y-4" data-testid="import-progress">
            <div className="label-eyebrow">Import progress {importId ? `· ${importId}` : ""}</div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "var(--primary)" }}
              />
            </div>
            <div className="text-sm font-bold">{pct.toFixed(0)}%</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="card p-3">
                <div className="label-eyebrow">Found</div>
                <div className="font-display text-xl font-bold">{progress.found}</div>
              </div>
              <div className="card p-3">
                <div className="label-eyebrow">Imported</div>
                <div className="font-display text-xl font-bold">{progress.imported}</div>
              </div>
              <div className="card p-3">
                <div className="label-eyebrow">Updated</div>
                <div className="font-display text-xl font-bold">{progress.updated}</div>
              </div>
              <div className="card p-3">
                <div className="label-eyebrow">Skipped</div>
                <div className="font-display text-xl font-bold">{progress.skipped}</div>
              </div>
              <div className="card p-3">
                <div className="label-eyebrow">Failed</div>
                <div className="font-display text-xl font-bold">{progress.failed}</div>
              </div>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm font-medium" style={{ color: "var(--accent)" }} data-testid="import-success">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm font-medium" style={{ color: "var(--primary)" }} data-testid="import-error">
            {error}
          </p>
        )}
      </div>
    </Protected>
  );
}
