"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import RoleAgreementCenter from "@/components/pages/RoleAgreementCenter";
import { DISPENSARY_SLUG, resolveOnboardingCategorySlug } from "@/lib/merchant/categoryConfig";

export default function RestaurantOnboardingClient() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const initialCategory = resolveOnboardingCategorySlug(categoryParam);
  const isDispensary = initialCategory === DISPENSARY_SLUG;
  const onboardingPath = `/restaurant/onboarding${initialCategory ? `?category=${initialCategory}` : ""}`;

  useEffect(() => {
    if (!user) {
      router.replace(`/restaurant/login?next=${encodeURIComponent(onboardingPath)}`);
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
  }, [user, router, refresh, onboardingPath]);

  if (!user) return null;

  return (
    <RoleAgreementCenter
      roleLabel={isDispensary ? "Licensed Dispensary" : "Restaurant"}
      initialMerchantCategory={initialCategory}
    />
  );
}
