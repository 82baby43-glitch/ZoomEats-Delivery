"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import RoleAgreementCenter from "@/components/pages/RoleAgreementCenter";
import { PRIMARY_SIGNUP_SLUGS, isPrimarySignupSlug } from "@/lib/merchant/categoryConfig";

const CATEGORY_COPY = {
  restaurants: {
    title: "Restaurant partner signup",
    subtitle: "List your restaurant, manage your menu, and accept delivery orders on ZoomEats.",
  },
  local_retail: {
    title: "Local retail partner signup",
    subtitle: "Bring your neighborhood shop online with delivery and pickup through ZoomEats.",
  },
  convenience_stores: {
    title: "Convenience store partner signup",
    subtitle: "Sell essentials, snacks, and household items with local delivery.",
  },
  liquor_stores: {
    title: "Liquor store partner signup",
    subtitle: "Licensed liquor retailers with age-verified delivery compliance.",
  },
};

export default function MerchantSignupClient() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const initialCategory = isPrimarySignupSlug(categoryParam) ? categoryParam : null;
  const copy = CATEGORY_COPY[initialCategory || "restaurants"];

  useEffect(() => {
    if (!user) {
      router.replace(`/restaurant/login?next=${encodeURIComponent(`/signup/merchant${initialCategory ? `?category=${initialCategory}` : ""}`)}`);
      return;
    }
    if (user.role !== "vendor" && user.role !== "restaurant") {
      (async () => {
        try {
          await api.post("/auth/role", { role: "vendor" });
          await refresh();
        } catch {
          router.replace("/onboarding");
        }
      })();
    }
  }, [user, router, refresh, initialCategory]);

  if (!user) return null;

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="label-eyebrow">Merchant signup</div>
        <h1 className="font-display text-3xl font-bold mt-2">{copy.title}</h1>
        <p className="mt-2" style={{ color: "var(--muted)" }}>{copy.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {PRIMARY_SIGNUP_SLUGS.map((slug) => (
            <Link
              key={slug}
              href={`/signup/merchant?category=${slug}`}
              className={`badge ${initialCategory === slug ? "ring-2 ring-[var(--primary)]" : ""}`}
            >
              {CATEGORY_COPY[slug].title.replace(" partner signup", "")}
            </Link>
          ))}
        </div>
        <div className="mt-8">
          <RoleAgreementCenter roleLabel="Restaurant" initialMerchantCategory={initialCategory} />
        </div>
      </div>
    </div>
  );
}
