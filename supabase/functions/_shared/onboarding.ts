/** Onboarding step definitions and validation for driver/restaurant wizards. */

export const DRIVER_STEPS = [
  { id: 1, key: "personal", title: "Personal Information" },
  { id: 2, key: "eligibility", title: "Driver Eligibility" },
  { id: 3, key: "tax_payment", title: "Tax & Payment Setup" },
  { id: 4, key: "legal", title: "Legal Agreements" },
] as const;

export const RESTAURANT_STEPS = [
  { id: 1, key: "profile", title: "Business Profile" },
  { id: 2, key: "verification", title: "Business Verification" },
  { id: 3, key: "payments", title: "Payments" },
  { id: 4, key: "legal", title: "Legal Agreements" },
] as const;

export const DRIVER_REQUIRED_DOCS = [
  "drivers_license",
  "insurance",
] as const;

export const RESTAURANT_REQUIRED_DOCS = [
  "business_license",
] as const;

export const RESTAURANT_OPTIONAL_DOCS = [
  "food_permit",
  "owner_id",
] as const;

export type OnboardingType = "driver" | "restaurant";

export function onboardingPath(type: OnboardingType): string {
  return type === "driver" ? "/driver/onboarding" : "/restaurant/onboarding";
}

export function stepFieldsForDriver(step: number): string[] {
  switch (step) {
    case 1:
      return [
        "legal_name", "date_of_birth", "phone", "email",
        "address_line1", "city", "state", "zip",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
      ];
    case 2:
      return [
        "license_number", "license_state", "license_expiration",
        "vehicle_make", "vehicle_model", "vehicle_year", "vehicle_color", "vehicle_plate",
        "insurance_provider", "insurance_policy_number", "insurance_expiration",
      ];
    default:
      return [];
  }
}

export function stepFieldsForRestaurant(step: number): string[] {
  switch (step) {
    case 1:
      return [
        "business_name", "owner_name", "business_address", "phone", "email",
        "cuisine", "hours",
      ];
    case 2:
      return ["ein", "sales_tax_id", "owner_verified", "food_permit_required"];
    default:
      return [];
  }
}
