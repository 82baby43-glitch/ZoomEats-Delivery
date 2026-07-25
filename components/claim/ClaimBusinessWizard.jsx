"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  Search,
  Store,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Header from "@/components/Header";
import { businessCategoryLabel } from "@/lib/merchant/googleCategoryMap";

const STEPS = ["search", "select", "confirm", "submitted"];

export default function ClaimBusinessWizard() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Columbia");
  const [state, setState] = useState("MO");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [lookup, setLookup] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState({ google_places_enabled: false });

  useEffect(() => {
    api.get("/claim/config").then((r) => setConfig(r?.data || r)).catch(() => {});
  }, []);

  const search = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/claim/search", { query, city, state });
      const list = res?.data?.results || res?.results || [];
      setResults(list);
      setStep(1);
    } catch (e) {
      setError(e?.message || "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const selectPlace = async (place) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.get(`/claim/place/${encodeURIComponent(place.google_place_id)}`);
      const data = res?.data || res;
      if (data?.listing?.owned) {
        setError("This business has already been claimed on ZoomEats.");
        return;
      }
      setSelected(place);
      setLookup(data);
      setStep(2);
    } catch (e) {
      setError(e?.message || "Could not load business details");
    } finally {
      setBusy(false);
    }
  };

  const submitClaim = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/claim/submit", {
        google_place_id: selected.google_place_id,
        merchant_notes: notes,
      });
      await refresh();
      setStep(3);
    } catch (e) {
      setError(e?.message || "Claim submission failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div>
        <Header />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <h1 className="font-display text-3xl font-bold">Claim Your Business</h1>
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
            Sign in to find your Google listing and join the ZoomEats marketplace.
          </p>
          <Link href="/login?redirect=/claim" className="btn-primary inline-block mt-6">
            Sign in to continue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <Link href="/onboarding" className="text-sm inline-flex items-center gap-1" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> Back
        </Link>

        <div className="mt-4">
          <div className="label-eyebrow">ZoomEats Marketplace</div>
          <h1 className="font-display text-4xl font-black tracking-tight mt-1">Claim Your Business</h1>
          <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--muted)" }}>
            Search your Google listing, confirm your details, and become a verified ZoomEats local partner.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className="px-3 py-1 rounded-full"
              style={{
                background: i <= step ? "rgba(74,222,128,0.15)" : "var(--surface-2)",
                color: i <= step ? "#4ade80" : "var(--muted)",
              }}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
            {error}
          </div>
        )}

        {step === 0 && (
          <div className="card p-6 mt-8 space-y-4">
            {!config.google_places_enabled && (
              <p className="text-sm" style={{ color: "#fbbf24" }}>
                Google Places search is not configured in this environment. Contact the platform admin.
              </p>
            )}
            <div>
              <label className="text-sm font-bold">Business name</label>
              <input
                className="input mt-1 w-full"
                placeholder="Tiger Liquor, Columbia Liquor, your restaurant..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold">City</label>
                <input className="input mt-1 w-full" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-bold">State</label>
                <input className="input mt-1 w-full" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={busy || !query.trim() || !config.google_places_enabled}
              onClick={search}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search Google Listings
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="mt-8 space-y-3">
            {results.length === 0 ? (
              <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
                No matching businesses found. Try a different name or location.
              </div>
            ) : (
              results.map((place) => (
                <button
                  key={place.google_place_id}
                  type="button"
                  className="card p-4 w-full text-left hover:ring-2 hover:ring-[var(--primary)] transition"
                  onClick={() => selectPlace(place)}
                  disabled={busy || !place.claimable}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">{place.name}</div>
                      <div className="text-sm mt-1 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                        <MapPin size={12} /> {place.address}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="badge">{businessCategoryLabel(place.business_category)}</span>
                        {!place.claimable && <span className="badge">Closed on Google</span>}
                      </div>
                    </div>
                    <ArrowRight size={16} style={{ color: "var(--muted)" }} />
                  </div>
                </button>
              ))
            )}
            <button type="button" className="btn-ghost text-sm" onClick={() => setStep(0)}>
              Search again
            </button>
          </div>
        )}

        {step === 2 && selected && (
          <div className="card p-6 mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <Store size={20} />
              <div>
                <div className="font-bold text-xl">{lookup?.preview?.name || selected.name}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>{lookup?.preview?.address || selected.address}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div><strong>Category:</strong> {businessCategoryLabel(lookup?.preview?.business_category)}</div>
              <div><strong>Phone:</strong> {lookup?.preview?.phone || "—"}</div>
              <div><strong>Website:</strong> {lookup?.preview?.website || "—"}</div>
              <div><strong>Status:</strong> {lookup?.preview?.business_status || "—"}</div>
            </div>
            <div>
              <label className="text-sm font-bold">Notes for ZoomEats review (optional)</label>
              <textarea
                className="input mt-1 w-full min-h-[90px]"
                placeholder="Tell us you're the owner, manager, or authorized representative..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy} onClick={submitClaim}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                Submit Claim Request
              </button>
              <button type="button" className="btn-ghost" onClick={() => setStep(1)}>Back</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card p-8 mt-8 text-center">
            <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: "#4ade80" }} />
            <h2 className="font-display text-2xl font-bold">Claim submitted</h2>
            <p className="text-sm mt-3 max-w-lg mx-auto" style={{ color: "var(--muted)" }}>
              Your claim is pending verification. Complete merchant setup while we review your request.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" className="btn-primary" onClick={() => router.push("/restaurant/onboarding")}>
                Complete Merchant Setup
              </button>
              <Link href="/admin/merchant-claims" className="btn-ghost text-sm">
                Admin: review claims
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
