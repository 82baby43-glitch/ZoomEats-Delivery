"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import RestaurantSelector from "@/components/restaurants/RestaurantSelector";
import PartnerBadge from "@/components/restaurants/PartnerBadge";
import { api } from "@/lib/api";
import { signUpWithEmail, useAuth } from "@/lib/auth";
import { LoadingSkeleton } from "@/components/ui/PageStates";
import { Building2, CheckCircle2, ClipboardList, UserPlus } from "lucide-react";

const STEPS = [
  { id: 1, title: "Find Your Restaurant", icon: Building2 },
  { id: 2, title: "Create Partner Account", icon: UserPlus },
  { id: 3, title: "Complete Restaurant Setup", icon: ClipboardList },
];

export default function RestaurantPartnerSignup() {
  const searchParams = useSearchParams();
  const { user, refresh, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState(searchParams.get("restaurant_id") || "");
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [accountForm, setAccountForm] = useState({
    owner_name: "",
    business_email: "",
    phone: "",
    password: "",
    verification_notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [claimComplete, setClaimComplete] = useState(false);

  useEffect(() => {
    const initialStep = Number(searchParams.get("step") || "1");
    if (initialStep >= 1 && initialStep <= 3) setStep(initialStep);
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && user && step === 2) {
      setAccountForm((f) => ({
        ...f,
        owner_name: f.owner_name || user.name || "",
        business_email: f.business_email || user.email || "",
      }));
    }
  }, [authLoading, user, step]);

  const continueToAccount = () => {
    if (!selectedId || !selectedRestaurant) {
      setError("Select a restaurant to continue.");
      return;
    }
    setError("");
    setStep(2);
  };

  const submitClaim = async () => {
    setBusy(true);
    setError("");
    try {
      if (!selectedId) throw new Error("Select a restaurant first.");

      if (!user) {
        if (!accountForm.owner_name.trim() || !accountForm.business_email.trim() || !accountForm.password.trim()) {
          throw new Error("Name, email, and password are required.");
        }
        await signUpWithEmail(accountForm.business_email.trim(), accountForm.password, {
          name: accountForm.owner_name.trim(),
          role: "vendor",
        });
        await refresh();
      }

      await api.post("/restaurant-claims", {
        restaurant_id: selectedId,
        owner_name: accountForm.owner_name.trim(),
        business_email: accountForm.business_email.trim(),
        phone: accountForm.phone.trim() || undefined,
        verification_notes: accountForm.verification_notes.trim() || undefined,
      });

      setClaimComplete(true);
      setStep(3);
    } catch (e) {
      setError(e?.message || "Could not submit restaurant claim.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading && step > 1) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-12"><LoadingSkeleton label="Loading partner signup…" rows={4} /></div>
      </div>
    );
  }

  return (
    <div data-testid="restaurant-partner-signup">
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-12">
        <div className="label-eyebrow">Restaurant Partners</div>
        <h1 className="font-display text-4xl font-black tracking-tight mt-2">Join ZoomEats</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          Find your restaurant listing, claim ownership, and start receiving orders from local customers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id || (s.id === 3 && claimComplete);
            return (
              <div
                key={s.id}
                className="card p-4"
                style={active ? { borderColor: "var(--primary)" } : {}}
              >
                <div className="flex items-center gap-2">
                  {done ? <CheckCircle2 size={18} style={{ color: "#4ade80" }} /> : <Icon size={18} />}
                  <div className="text-sm font-bold">{s.title}</div>
                </div>
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <div className="card p-6 mt-6 space-y-5">
            <h2 className="font-display text-2xl font-bold">Find Your Restaurant</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Search the ZoomEats restaurant database powered by OpenStreetMap listings.
            </p>
            <RestaurantSelector
              value={selectedId}
              onChange={setSelectedId}
              onSelectRestaurant={setSelectedRestaurant}
              claimableOnly
              showPartnerBadge
              placeholder="Search restaurants to claim…"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" className="btn-primary" onClick={continueToAccount} data-testid="claim-restaurant-continue">
              Claim This Restaurant
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card p-6 mt-6 space-y-5">
            <h2 className="font-display text-2xl font-bold">Create Your ZoomEats Partner Account</h2>
            {selectedRestaurant && (
              <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div className="font-bold">{selectedRestaurant.name}</div>
                <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                  {[selectedRestaurant.address, selectedRestaurant.city, selectedRestaurant.state].filter(Boolean).join(", ")}
                </div>
                <div className="mt-2"><PartnerBadge status={selectedRestaurant.partner_status} /></div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="input-field"
                placeholder="Owner / manager name"
                value={accountForm.owner_name}
                onChange={(e) => setAccountForm((f) => ({ ...f, owner_name: e.target.value }))}
                data-testid="claim-owner-name"
              />
              <input
                className="input-field"
                placeholder="Business email"
                type="email"
                value={accountForm.business_email}
                onChange={(e) => setAccountForm((f) => ({ ...f, business_email: e.target.value }))}
                data-testid="claim-business-email"
              />
              <input
                className="input-field"
                placeholder="Phone number"
                value={accountForm.phone}
                onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))}
              />
              {!user && (
                <input
                  className="input-field"
                  placeholder="Password"
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
                  data-testid="claim-password"
                />
              )}
            </div>
            <textarea
              className="input-field"
              rows={3}
              placeholder="Verification information (role at restaurant, permit number, or other proof)"
              value={accountForm.verification_notes}
              onChange={(e) => setAccountForm((f) => ({ ...f, verification_notes: e.target.value }))}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn-primary" disabled={busy} onClick={submitClaim} data-testid="claim-submit">
                {busy ? "Submitting…" : user ? "Submit Claim" : "Create Account & Submit Claim"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card p-6 mt-6 space-y-5">
            <h2 className="font-display text-2xl font-bold">Complete Restaurant Setup</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Your claim is pending admin verification. You can start setting up your menu, hours, photos, delivery settings, and Stripe Connect payouts now.
            </p>
            <ul className="space-y-2 text-sm">
              {["Menu upload", "Operating hours", "Restaurant photos", "Business description", "Delivery settings", "Stripe Connect payouts"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={14} style={{ color: "var(--primary)" }} /> {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/restaurant/onboarding" className="btn-primary">Continue setup</Link>
              <Link href="/restaurant/dashboard" className="btn-secondary">Open merchant dashboard</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
