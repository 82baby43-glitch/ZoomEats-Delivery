import type { SupabaseClient } from "@supabase/supabase-js";
import { DISPENSARY_SLUG } from "./categoryConfig.ts";

export type ComplianceProfileInput = {
  merchant_id: string;
  merchant_category?: string | null;
  license_number?: string | null;
  license_expiration?: string | null;
  verification_status?: string | null;
  fulfillment_type?: string | null;
  business_address?: string | null;
};

/** Upsert regulated merchant compliance profile for marketplace software partners. */
export async function syncMerchantComplianceProfile(
  db: SupabaseClient,
  input: ComplianceProfileInput
) {
  const category = input.merchant_category || DISPENSARY_SLUG;
  if (category !== DISPENSARY_SLUG) return null;

  const { data: existing } = await db
    .from("merchant_compliance_profiles")
    .select("*")
    .eq("merchant_id", input.merchant_id)
    .maybeSingle();

  const row: Record<string, unknown> = {
    merchant_id: input.merchant_id,
    merchant_category: category,
    license_number: input.license_number ?? existing?.license_number ?? null,
    license_expiration: input.license_expiration ?? existing?.license_expiration ?? null,
    verification_status: input.verification_status ?? existing?.verification_status ?? "pending",
    fulfillment_type: input.fulfillment_type !== undefined ? input.fulfillment_type : existing?.fulfillment_type ?? null,
    business_address: input.business_address ?? existing?.business_address ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("merchant_compliance_profiles")
    .upsert(row, { onConflict: "merchant_id" })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function loadMerchantComplianceProfile(db: SupabaseClient, merchantId: string) {
  const { data } = await db
    .from("merchant_compliance_profiles")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data;
}

export function mapApprovalToVerificationStatus(approvalStatus: string): string {
  if (approvalStatus === "approved") return "approved";
  if (approvalStatus === "rejected") return "rejected";
  if (approvalStatus === "suspended") return "suspended";
  if (approvalStatus === "documents_missing") return "info_requested";
  return "pending";
}
