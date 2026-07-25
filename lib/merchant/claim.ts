import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchPlaceDetailsForClaim,
  searchBusinessesForClaim,
  upsertClaimableListing,
} from "../server/googlePlacesClaim";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function searchClaimableBusinesses(input: {
  query: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}) {
  const results = await searchBusinessesForClaim(input);
  return { results };
}

export async function lookupClaimablePlace(db: SupabaseClient, googlePlaceId: string) {
  const preview = await fetchPlaceDetailsForClaim(googlePlaceId);
  const listing = await upsertClaimableListing(db, preview);

  const { data: restaurant } = await db
    .from("restaurants")
    .select("*")
    .eq("restaurant_id", listing.restaurant_id)
    .maybeSingle();

  return {
    preview,
    restaurant,
    listing,
  };
}

export async function submitBusinessClaim(
  db: SupabaseClient,
  userId: string,
  input: { google_place_id: string; merchant_notes?: string }
) {
  const { preview, listing } = await lookupClaimablePlace(db, input.google_place_id);

  if (listing.owned) {
    throw new Error("This business has already been claimed");
  }

  const restaurantId = listing.restaurant_id;
  const now = new Date().toISOString();

  const { data: existingClaim } = await db
    .from("business_claim_requests")
    .select("claim_id, status")
    .eq("user_id", userId)
    .in("status", ["claim_requested", "pending_verification"])
    .maybeSingle();

  if (existingClaim?.claim_id) {
    throw new Error("You already have a pending claim request");
  }

  const { data: userRestaurant } = await db
    .from("restaurants")
    .select("restaurant_id")
    .eq("owner_id", userId)
    .neq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle();

  if (userRestaurant?.restaurant_id) {
    throw new Error("You already have a merchant profile. Contact support to transfer ownership.");
  }

  const claimId = uid("claim");

  const { error: claimErr } = await db.from("business_claim_requests").insert({
    claim_id: claimId,
    restaurant_id: restaurantId,
    google_place_id: preview.google_place_id,
    user_id: userId,
    status: "pending_verification",
    merchant_notes: input.merchant_notes || null,
    created_at: now,
    updated_at: now,
  });
  if (claimErr) throw new Error(claimErr.message);

  await db.from("restaurants").update({
    owner_id: userId,
    claim_status: "pending_verification",
    business_category: preview.business_category,
    merchant_category_slug: preview.merchant_category_slug,
    is_local_partner: true,
    updated_at: now,
  }).eq("restaurant_id", restaurantId);

  await db.from("restaurant_onboarding").upsert({
    user_id: userId,
    restaurant_id: restaurantId,
    merchant_category_slug: preview.merchant_category_slug,
    business_name: preview.name,
    business_address: preview.address,
    phone: preview.phone || null,
    hours: preview.opening_hours || null,
    verification_status: "pending",
    updated_at: now,
  });

  await db.from("users").update({
    role: "vendor",
    approval_status: "pending",
    updated_at: now,
  }).eq("user_id", userId);

  return {
    claim_id: claimId,
    restaurant_id: restaurantId,
    status: "pending_verification",
    preview,
  };
}

export async function getMyClaimStatus(db: SupabaseClient, userId: string) {
  const [{ data: claim }, { data: restaurant }] = await Promise.all([
    db
      .from("business_claim_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("restaurants")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return { claim, restaurant };
}

export async function listMerchantClaims(
  db: SupabaseClient,
  filters: { status?: string; category?: string; q?: string } = {}
) {
  let q = db
    .from("business_claim_requests")
    .select("*, restaurants(*), users:user_id(user_id,name,email)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status) q = q.eq("status", filters.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = data || [];
  if (filters.category) {
    rows = rows.filter((r) => {
      const rest = r.restaurants as Record<string, unknown> | null;
      return rest?.business_category === filters.category || rest?.merchant_category_slug === filters.category;
    });
  }
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    rows = rows.filter((r) => {
      const rest = r.restaurants as Record<string, unknown> | null;
      const user = r.users as Record<string, unknown> | null;
      return [rest?.name, rest?.address, user?.name, user?.email].some((v) =>
        String(v || "").toLowerCase().includes(needle)
      );
    });
  }
  return rows;
}

export async function approveMerchantClaim(
  db: SupabaseClient,
  claimId: string,
  adminUserId: string
) {
  const { data: claim } = await db
    .from("business_claim_requests")
    .select("*")
    .eq("claim_id", claimId)
    .maybeSingle();
  if (!claim) throw new Error("Claim not found");

  const now = new Date().toISOString();

  await db.from("business_claim_requests").update({
    status: "verified_local_partner",
    reviewed_by: adminUserId,
    reviewed_at: now,
    updated_at: now,
  }).eq("claim_id", claimId);

  await db.from("restaurants").update({
    approved: true,
    approval_status: "approved",
    active: true,
    claim_status: "verified_local_partner",
    is_local_partner: true,
    verification_date: now,
    accepting_orders: false,
    launch_status: "pending_menu",
    updated_at: now,
  }).eq("restaurant_id", claim.restaurant_id);

  if (claim.user_id) {
    await db.from("users").update({
      approval_status: "approved",
      active: true,
      updated_at: now,
    }).eq("user_id", claim.user_id);

    await db.from("restaurant_onboarding").update({
      verification_status: "approved",
      updated_at: now,
    }).eq("user_id", claim.user_id);
  }

  return { ok: true, claim_id: claimId, restaurant_id: claim.restaurant_id };
}

export async function rejectMerchantClaim(
  db: SupabaseClient,
  claimId: string,
  adminUserId: string,
  adminNotes?: string
) {
  const { data: claim } = await db
    .from("business_claim_requests")
    .select("*")
    .eq("claim_id", claimId)
    .maybeSingle();
  if (!claim) throw new Error("Claim not found");

  const now = new Date().toISOString();

  await db.from("business_claim_requests").update({
    status: "rejected",
    admin_notes: adminNotes || null,
    reviewed_by: adminUserId,
    reviewed_at: now,
    updated_at: now,
  }).eq("claim_id", claimId);

  await db.from("restaurants").update({
    owner_id: null,
    claim_status: "rejected",
    is_local_partner: false,
    updated_at: now,
  }).eq("restaurant_id", claim.restaurant_id);

  return { ok: true, claim_id: claimId };
}

export async function updateMerchantClaimInfo(
  db: SupabaseClient,
  restaurantId: string,
  patch: Record<string, unknown>
) {
  const allowed = [
    "name", "address", "phone", "website", "business_category",
    "merchant_category_slug", "is_featured_partner", "is_local_partner",
    "opening_hours", "description",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (patch[key] !== undefined) updates[key] = patch[key];
  }
  const { data, error } = await db
    .from("restaurants")
    .update(updates)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
