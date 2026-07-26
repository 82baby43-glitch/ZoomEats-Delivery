"use client";

import { CompanionModeProvider } from "@/components/companion/CompanionModeProvider";
import RestaurantProductionDashboard from "@/components/restaurant/RestaurantProductionDashboard";

/** Production restaurant dashboard — live orders, kitchen, analytics, and store management. */
export default function VendorDashboard() {
  return (
    <CompanionModeProvider>
      <RestaurantProductionDashboard />
    </CompanionModeProvider>
  );
}
