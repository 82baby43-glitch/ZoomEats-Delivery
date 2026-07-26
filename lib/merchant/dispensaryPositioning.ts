/** Licensed Dispensary marketplace software positioning (not a cannabis operator). */

export const DISPENSARY_CATEGORY_LABEL = "Licensed Dispensary";

export const DISPENSARY_MERCHANT_TYPE = "Licensed Cannabis Retailer";

export const DISPENSARY_PLATFORM_ROLE = "Marketplace Software Partner";

export const DISPENSARY_CATEGORY_DESCRIPTION =
  "ZoomEats provides licensed merchants with marketplace software, digital ordering tools, merchant management systems, and logistics coordination technology. Merchants remain responsible for their own licenses, inventory compliance, and regulatory operations.";

export const DISPENSARY_LICENSING_ACKNOWLEDGMENT =
  "I confirm that my business maintains all required licenses and approvals to operate. ZoomEats provides technology services and does not replace merchant licensing responsibilities.";

export const MARKETPLACE_SIGNUP_CTA = "Join the ZoomEats regulated merchant marketplace";

export const ORDERING_TECHNOLOGY_STATEMENT =
  "ZoomEats provides ordering technology and logistics management tools for approved merchants.";

export const VERIFIED_MARKETPLACE_MERCHANT_BADGE = "Verified Marketplace Merchant";

export const MERCHANT_RESPONSIBILITIES = [
  "Maintain required state/local licenses",
  "Maintain product compliance",
  "Manage inventory compliance",
  "Complete required regulatory reporting",
  "Operate approved fulfillment process",
] as const;

export const ZOOMEATS_PROVIDES = [
  "Digital storefront",
  "Customer marketplace access",
  "Order management system",
  "Merchant dashboard",
  "Payment technology",
  "Logistics coordination tools",
] as const;

export const FULFILLMENT_OPTIONS = [
  {
    value: "merchant_managed",
    label: "Merchant Managed Fulfillment",
    description: "Your licensed staff prepares and hands off orders per your approved process.",
  },
  {
    value: "third_party_transport",
    label: "Approved Third-Party Transportation Provider",
    description: "Use an approved third-party carrier. ZoomEats coordinates technology only.",
  },
  {
    value: "integrated_logistics",
    label: "Integrated Logistics Partner (where permitted)",
    description: "Connect permitted logistics partners through ZoomEats coordination tools.",
  },
] as const;

export type FulfillmentType = (typeof FULFILLMENT_OPTIONS)[number]["value"];

export const VERIFICATION_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function isDispensarySlug(slug?: string | null): boolean {
  return slug === "licensed_dispensary";
}

export function isVerifiedDispensaryMerchant(
  merchantCategorySlug?: string | null,
  verificationStatus?: string | null,
  approved?: boolean | null
): boolean {
  return (
    isDispensarySlug(merchantCategorySlug) &&
    Boolean(approved) &&
    verificationStatus === "approved"
  );
}
