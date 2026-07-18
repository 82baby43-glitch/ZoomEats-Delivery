"use client";

import { useEffect, useState } from "react";
import { safeGet } from "@/lib/api";

export default function MerchantCategoryPicker({ value, onChange, onContinue }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeGet("/marketplace/categories", []).then((data) => {
      setCategories(Array.isArray(data) ? data : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading merchant categories…</p>;
  }

  return (
    <div className="space-y-4" data-testid="merchant-category-picker">
      <div>
        <h3 className="font-bold text-lg">What type of business are you?</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Choose your merchant category. You will complete verification steps for your business type.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            type="button"
            className={`card p-4 text-left transition-all ${value === cat.slug ? "ring-2 ring-[var(--primary)]" : "card-hover"}`}
            onClick={() => onChange(cat.slug)}
            data-testid={`merchant-category-${cat.slug}`}
          >
            <span className="text-2xl" aria-hidden>{cat.icon}</span>
            <div className="font-bold mt-2">{cat.label}</div>
            {cat.compliance_settings?.age_verification && (
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Age-restricted · license required</div>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={!value}
        onClick={onContinue}
        data-testid="merchant-category-continue"
      >
        Continue
      </button>
    </div>
  );
}
