import { Sparkles, Loader2 } from "lucide-react";

export default function DigestCard({ digest, loading, onGenerate }) {
  return (
    <div className="card p-6 lg:col-span-2" data-testid="digest-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: "var(--primary)" }} />
          <h3 className="font-display text-xl font-bold">Today&apos;s digest by Zoey</h3>
        </div>
        <button
          className="btn-secondary !py-2 !px-3 flex items-center gap-2 text-sm"
          onClick={onGenerate}
          disabled={loading}
          data-testid="generate-digest"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {digest ? "Regenerate" : "Generate"}
        </button>
      </div>
      {!digest && !loading && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Click &quot;Generate&quot; for an AI summary of today&apos;s platform activity (orders, GMV, top performers, items needing attention).
        </p>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          <Loader2 size={14} className="animate-spin" /> Asking Claude…
        </div>
      )}
      {digest && (
        <>
          <p className="leading-relaxed" data-testid="digest-text">{digest.digest}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[
              ["Orders", digest.stats.orders],
              ["Paid", digest.stats.paid_orders],
              ["GMV", `$${digest.stats.gmv.toFixed(2)}`],
              ["New restaurants", digest.stats.new_restaurants],
            ].map(([l, v]) => (
              <div key={l} style={{ background: "var(--surface-2)" }} className="rounded-lg p-3">
                <div className="label-eyebrow">{l}</div>
                <div className="font-display text-lg font-black mt-1">{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
