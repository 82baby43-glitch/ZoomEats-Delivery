"use client";

import { useEffect, useMemo, useState } from "react";
import { safeGet } from "@/lib/api";
import { MERCHANT_SIGNUP_GROUPS, PRIMARY_SIGNUP_SLUGS } from "@/lib/merchant/categoryConfig";

export default function MerchantCategoryPicker({ value, onChange, onContinue }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeGet("/marketplace/categories", []).then((data) => {
      setCategories(Array.isArray(data) ? data : []);
    }).finally(() => setLoading(false));
  }, []);

  const signupCategories = useMemo(() => {
    const allowed = new Set(PRIMARY_SIGNUP_SLUGS);
    return categories.filter((cat) => allowed.has(cat.slug));
  }, [categories]);

  const grouped = useMemo(() => {
    return MERCHANT_SIGNUP_GROUPS.map((group) => ({
      ...group,
      categories: signupCategories.filter((cat) => group.slugs.includes(cat.slug)),
    })).filter((group) => group.categories.length > 0);
  }, [signupCategories]);

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading merchant categories…</p>;
  }

  return (
    <div className="space-y-6" data-testid="merchant-category-picker">
      <div>
        <h3 className="font-bold text-lg">What type of business are you?</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Choose your merchant category. Restaurants and local shops each have a dedicated signup path with the right verification steps.
        </p>
      </div>

      {grouped.map((group) => (
        <div key={group.id} className="space-y-3">
          <div>
            <h4 className="font-bold">{group.label}</h4>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{group.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.categories.map((cat) => (
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
        </div>
      ))}

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
