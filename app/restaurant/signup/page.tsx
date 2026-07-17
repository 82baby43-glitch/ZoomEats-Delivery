import { Suspense } from "react";
import RestaurantSignupRedirect from "@/components/pages/RestaurantSignupRedirect";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RestaurantSignupRedirect />
    </Suspense>
  );
}
