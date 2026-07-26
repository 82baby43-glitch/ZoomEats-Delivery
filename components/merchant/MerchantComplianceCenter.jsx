"use client";

import { useEffect, useState } from "react";
import { Shield, FileText, Truck, Store } from "lucide-react";
import { api } from "@/lib/api";
import {
  DISPENSARY_CATEGORY_LABEL,
  DISPENSARY_MERCHANT_TYPE,
  DISPENSARY_PLATFORM_ROLE,
  FULFILLMENT_OPTIONS,
  VERIFIED_MARKETPLACE_MERCHANT_BADGE,
} from "@/lib/merchant/dispensaryPositioning";
import MerchantComplianceResponsibilities from "@/components/compliance/MerchantComplianceResponsibilities";

function statusColor(status) {
  if (status === "approved") return "text-green-400";
  if (status === "rejected" || status === "suspended") return "text-red-400";
  return "text-amber-400";
}

export default function MerchantComplianceCenter({ restaurant }) {
  const [profile, setProfile] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/vendor/compliance");
      const data = res?.data ?? res;
      setProfile(data?.compliance_profile || null);
      setOnboarding(data?.onboarding || null);
      setDocuments(data?.documents || []);
      setFulfillmentType(data?.compliance_profile?.fulfillment_type || "");
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [restaurant?.restaurant_id]);

  const saveFulfillment = async () => {
    setSaving(true);
    try {
      await api.patch("/vendor/compliance", { fulfillment_type: fulfillmentType || null });
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>Loading compliance center…</div>;
  }

  const verificationStatus = profile?.verification_status || onboarding?.verification_status || "pending";
  const isApproved = verificationStatus === "approved" && restaurant?.approved;

  return (
    <div className="space-y-6 max-w-3xl" data-testid="merchant-compliance-center">
      <div className="card p-6">
        <div className="flex items-start gap-3">
          <Shield size={22} style={{ color: "var(--primary)" }} />
          <div>
            <h3 className="font-display text-xl font-bold">Compliance Center</h3>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Manage verification, licenses, and fulfillment settings for your regulated marketplace storefront.
            </p>
          </div>
        </div>
      </div>

      <MerchantComplianceResponsibilities />

      <section className="card p-6 space-y-3">
        <h4 className="font-bold flex items-center gap-2"><Store size={18} /> Business Verification</h4>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span style={{ color: "var(--muted)" }}>Merchant Category:</span> <strong>{DISPENSARY_CATEGORY_LABEL}</strong></div>
          <div><span style={{ color: "var(--muted)" }}>Merchant Type:</span> <strong>{DISPENSARY_MERCHANT_TYPE}</strong></div>
          <div><span style={{ color: "var(--muted)" }}>Platform Role:</span> <strong>{DISPENSARY_PLATFORM_ROLE}</strong></div>
          <div>
            <span style={{ color: "var(--muted)" }}>Verification Status:</span>{" "}
            <strong className={statusColor(verificationStatus)}>{verificationStatus}</strong>
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-3">
        <h4 className="font-bold flex items-center gap-2"><FileText size={18} /> License Information</h4>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span style={{ color: "var(--muted)" }}>Business:</span> {onboarding?.business_name || restaurant?.name || "—"}</div>
          <div><span style={{ color: "var(--muted)" }}>Owner:</span> {onboarding?.owner_name || "—"}</div>
          <div><span style={{ color: "var(--muted)" }}>Business license #:</span> {profile?.license_number || onboarding?.business_license_number || "—"}</div>
          <div><span style={{ color: "var(--muted)" }}>State license #:</span> {onboarding?.state_license_number || "—"}</div>
          <div><span style={{ color: "var(--muted)" }}>Expires:</span> {profile?.license_expiration || onboarding?.license_expiration_date || "—"}</div>
          <div><span style={{ color: "var(--muted)" }}>Address:</span> {profile?.business_address || onboarding?.business_address || restaurant?.address || "—"}</div>
        </div>
      </section>

      <section className="card p-6 space-y-3">
        <h4 className="font-bold flex items-center gap-2"><FileText size={18} /> Documents</h4>
        {documents.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No compliance documents on file yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {documents.map((doc) => (
              <li key={doc.document_id} className="flex justify-between gap-2 p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <span>{doc.document_type?.replace(/_/g, " ")} · {doc.file_name || doc.status}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{doc.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-6 space-y-4">
        <h4 className="font-bold flex items-center gap-2"><Truck size={18} /> Fulfillment Method</h4>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Select how your licensed business fulfills orders. ZoomEats provides coordination technology and is not the regulated transportation provider.
        </p>
        <div className="space-y-2">
          {FULFILLMENT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 p-3 rounded-lg border cursor-pointer" style={{ borderColor: fulfillmentType === opt.value ? "var(--primary)" : "var(--border)" }}>
              <input
                type="radio"
                name="fulfillment_type"
                value={opt.value}
                checked={fulfillmentType === opt.value}
                onChange={() => setFulfillmentType(opt.value)}
              />
              <span>
                <span className="font-medium block">{opt.label}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{opt.description}</span>
              </span>
            </label>
          ))}
        </div>
        <button type="button" className="btn-primary" disabled={saving || !fulfillmentType} onClick={saveFulfillment}>
          {saving ? "Saving…" : "Save fulfillment method"}
        </button>
      </section>

      <section className="card p-6 space-y-2">
        <h4 className="font-bold">Marketplace Status</h4>
        {isApproved ? (
          <div className="inline-flex items-center gap-2 text-sm font-bold text-green-400">
            <Shield size={16} /> {VERIFIED_MARKETPLACE_MERCHANT_BADGE}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your storefront will display the verified badge after admin approval. Status: <strong className={statusColor(verificationStatus)}>{verificationStatus}</strong>
          </p>
        )}
      </section>
    </div>
  );
}
