/** Agreement definitions for driver and restaurant compliance. */

export const AGREEMENT_VERSION = "1.0";

export type AgreementKind = "signature" | "checkbox";

export type AgreementDef = {
  type: string;
  title: string;
  kind: AgreementKind;
  required: boolean;
  role: "delivery" | "vendor";
  body: string;
};

export const DRIVER_AGREEMENTS: AgreementDef[] = [
  { type: "driver_service_agreement", title: "Driver Service Agreement", kind: "signature", required: true, role: "delivery", body: "You agree to provide delivery services through ZoomEats in accordance with platform standards, timely pickup and delivery, and professional conduct with customers and restaurants." },
  { type: "independent_contractor_agreement", title: "Independent Contractor Agreement", kind: "signature", required: true, role: "delivery", body: "You acknowledge you are an independent contractor, not an employee of ZoomEats. You control your schedule and are responsible for your own taxes and business expenses." },
  { type: "terms_of_service", title: "Terms of Service", kind: "signature", required: true, role: "delivery", body: "You agree to ZoomEats Terms of Service governing use of the platform, account security, and prohibited conduct." },
  { type: "privacy_policy", title: "Privacy Policy", kind: "signature", required: true, role: "delivery", body: "You acknowledge ZoomEats Privacy Policy describing how personal data, location data, and delivery activity are collected and used." },
  { type: "community_guidelines", title: "Community Guidelines", kind: "signature", required: true, role: "delivery", body: "You agree to treat customers, restaurant staff, and other drivers respectfully and follow community standards." },
  { type: "safety_policy", title: "Safety Policy", kind: "signature", required: true, role: "delivery", body: "You agree to follow safe driving practices, wear appropriate safety gear when required, and report incidents promptly." },
  { type: "background_check_consent", title: "Background Check Consent", kind: "signature", required: true, role: "delivery", body: "You consent to background checks and motor vehicle record reviews as required for driver eligibility." },
  { type: "electronic_signature_consent", title: "Electronic Signature Consent", kind: "signature", required: true, role: "delivery", body: "You consent to sign agreements electronically and receive records electronically." },
  { type: "insurance_confirmation", title: "Insurance Confirmation", kind: "checkbox", required: true, role: "delivery", body: "I confirm I maintain required insurance coverage for delivery activities." },
  { type: "vehicle_compliance", title: "Vehicle Compliance", kind: "checkbox", required: true, role: "delivery", body: "I certify my vehicle meets ZoomEats requirements for safe food delivery." },
  { type: "tax_acknowledgement", title: "Tax Acknowledgement", kind: "checkbox", required: true, role: "delivery", body: "I understand I am an independent contractor responsible for my own taxes." },
];

export const RESTAURANT_AGREEMENTS: AgreementDef[] = [
  { type: "merchant_agreement", title: "Merchant Agreement", kind: "signature", required: true, role: "vendor", body: "You agree to partner with ZoomEats as a merchant, fulfill orders accurately, and maintain food quality standards." },
  { type: "terms_of_service", title: "Terms of Service", kind: "signature", required: true, role: "vendor", body: "You agree to ZoomEats Terms of Service for merchants." },
  { type: "privacy_policy", title: "Privacy Policy", kind: "signature", required: true, role: "vendor", body: "You acknowledge ZoomEats Privacy Policy for merchant data." },
  { type: "refund_policy", title: "Refund Policy", kind: "signature", required: true, role: "vendor", body: "You agree to ZoomEats refund and order resolution policies." },
  { type: "commission_agreement", title: "Commission Agreement", kind: "signature", required: true, role: "vendor", body: "You agree to platform commission rates and fee schedules." },
  { type: "payment_agreement", title: "Payment Agreement", kind: "signature", required: true, role: "vendor", body: "You agree to payout terms, banking details accuracy, and payment schedules." },
  { type: "food_safety_certification", title: "Food Safety Certification", kind: "signature", required: true, role: "vendor", body: "You certify compliance with applicable food safety regulations." },
  { type: "tax_responsibility", title: "Tax Responsibility", kind: "signature", required: true, role: "vendor", body: "You are responsible for sales tax, permits, and regulatory compliance." },
  { type: "menu_accuracy_policy", title: "Menu Accuracy Policy", kind: "signature", required: true, role: "vendor", body: "You agree to keep menu items, prices, and availability accurate." },
  { type: "alcohol_compliance", title: "Alcohol Compliance", kind: "signature", required: false, role: "vendor", body: "Optional: alcohol sales compliance where applicable." },
  { type: "age_verification", title: "Age Verification", kind: "signature", required: false, role: "vendor", body: "Optional: age verification for restricted items." },
  { type: "electronic_signature", title: "Electronic Signature", kind: "signature", required: true, role: "vendor", body: "You consent to electronic signatures for merchant agreements." },
];

export const DISPENSARY_EXTRA_AGREEMENTS: AgreementDef[] = [
  {
    type: "cannabis_merchant_compliance",
    title: "Licensed Cannabis Merchant Compliance",
    kind: "signature",
    required: true,
    role: "vendor",
    body: "You certify that you hold valid state and local cannabis licenses, will sell only within licensed scope, and will comply with all applicable cannabis delivery regulations.",
  },
  {
    type: "age_verification_merchant",
    title: "Age-Restricted Merchant Confirmation",
    kind: "checkbox",
    required: true,
    role: "vendor",
    body: "I confirm this is an age-restricted merchant and I will verify customer age and valid identification before fulfilling restricted product orders.",
  },
];

export function agreementsForRole(role: string, merchantCategory?: string | null): AgreementDef[] {
  if (role === "delivery" || role === "driver") return DRIVER_AGREEMENTS;
  if (role === "vendor" || role === "restaurant") {
    let list = [...RESTAURANT_AGREEMENTS];
    if (merchantCategory === "licensed_dispensary") {
      list = list.map((a) =>
        a.type === "age_verification" || a.type === "alcohol_compliance"
          ? { ...a, required: false }
          : a.type === "food_safety_certification"
            ? { ...a, required: false, title: "Product Safety (optional)" }
            : a
      );
      list = [...list, ...DISPENSARY_EXTRA_AGREEMENTS];
    }
    return list;
  }
  return [];
}

export function requiredAgreementTypes(role: string, merchantCategory?: string | null): string[] {
  return agreementsForRole(role, merchantCategory).filter((a) => a.required).map((a) => a.type);
}
