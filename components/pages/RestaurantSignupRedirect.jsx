"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function RestaurantSignupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    const restaurantId = searchParams.get("restaurant_id");
    if (restaurantId) params.set("restaurant_id", restaurantId);
    params.set("step", "2");
    router.replace(`/restaurant/claim?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}
