import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichClaimsWithRestaurants,
  extractCategories,
  filterRestaurantListings,
  getPartnerAnalytics,
  isRestaurantClaimable,
  normalizePartnerStatus,
} from "./helpers";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

const LISTING_FIELDS =
  "restaurant_id,name,address,city,state,cuisine,primary_category,latitude,longitude,partner_status,claim_status,merchant_verified,owner_id,import_source,approved,active";

async function listRestaurantListings(db: SupabaseClient, params: Record<string, string>) {
  const claimableOnly = params.claimable === "1" || params.claimable === "true";
  const limit = Math.min(Number(params.limit) || 500, 1000);

  const q = db
    .from("restaurants")
    .select(LISTING_FIELDS)
    .not("name", "ilike", "TEST_%")
    .order("name", { ascending: true })
    .limit(limit);

  const { data, error } = await q;
  if (error) throwErr(error.message, 500);

  const filtered = filterRestaurantListings(data || [], {
    q: params.q,
    category: params.category,
    claimableOnly,
  });

  return {
    restaurants: filtered,
    categories: extractCategories(data || []),
    total: filtered.length,
  };
}

async function submitRestaurantClaim(
  db: SupabaseClient,
  user: Record<string, unknown>,
  body: Record<string, unknown>
) {
  const restaurantId = String(body.restaurant_id || "");
  if (!restaurantId) throwErr("restaurant_id required");

  const { data: restaurant } = await db
    .from("restaurants")
    .select("restaurant_id,name,owner_id,partner_status,claim_status")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!restaurant) throwErr("Restaurant not found", 404);
  if (!isRestaurantClaimable(restaurant)) {
    throwErr("This restaurant is not available to claim", 409);
  }

  const ownerName = String(body.owner_name || user.name || "").trim();
  const businessEmail = String(body.business_email || user.email || "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  if (!ownerName || !businessEmail) throwErr("Owner name and business email are required");

  const userId = String(user.user_id);
  const verificationInfo = {
    business_role: body.business_role ? String(body.business_role) : "owner",
    notes: body.verification_notes ? String(body.verification_notes) : null,
  };

  const { data: claim, error: claimError } = await db
    .from("restaurant_claims")
    .insert({
      restaurant_id: restaurantId,
      user_id: userId,
      owner_name: ownerName,
      business_email: businessEmail,
      phone,
      verification_status: "pending",
      verification_info: verificationInfo,
    })
    .select()
    .single();
  if (claimError) throwErr(claimError.message, 500);

  await db
    .from("restaurants")
    .update({
      claimed_by_user_id: userId,
      owner_id: userId,
      claim_status: "pending",
      partner_status: "claim_pending",
      updated_at: new Date().toISOString(),
    })
    .eq("restaurant_id", restaurantId);

  await db.from("users").update({
    role: "vendor",
    approval_status: "pending",
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  await db.from("restaurant_onboarding").upsert({
    user_id: userId,
    restaurant_id: restaurantId,
    business_name: restaurant.name,
    owner_name: ownerName,
    phone,
    status: "incomplete",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return { ok: true, claim, restaurant_id: restaurantId, next_step: "/restaurant/setup" };
}

async function approveRestaurantClaim(db: SupabaseClient, admin: Record<string, unknown>, claimId: string) {
  const { data: claim } = await db.from("restaurant_claims").select("*").eq("id", claimId).maybeSingle();
  if (!claim) throwErr("Claim not found", 404);
  if (claim.verification_status !== "pending") throwErr("Claim is not pending", 409);

  const now = new Date().toISOString();
  await db.from("restaurant_claims").update({
    verification_status: "approved",
    approved_at: now,
  }).eq("id", claimId);

  await db.from("restaurants").update({
    claimed_by_user_id: claim.user_id,
    owner_id: claim.user_id,
    claim_status: "approved",
    merchant_verified: true,
    partner_status: "verified_partner",
    approved: true,
    approval_status: "approved",
    active: true,
    verified_at: now,
    updated_at: now,
  }).eq("restaurant_id", claim.restaurant_id);

  await db.from("users").update({
    role: "vendor",
    approval_status: "approved",
    active: true,
    agreement_complete: true,
    updated_at: now,
  }).eq("user_id", claim.user_id);

  return { ok: true, claim_id: claimId, restaurant_id: claim.restaurant_id, partner_status: "verified_partner" };
}

async function rejectRestaurantClaim(db: SupabaseClient, claimId: string, reason?: string) {
  const { data: claim } = await db.from("restaurant_claims").select("*").eq("id", claimId).maybeSingle();
  if (!claim) throwErr("Claim not found", 404);
  if (claim.verification_status !== "pending") throwErr("Claim is not pending", 409);

  await db.from("restaurant_claims").update({
    verification_status: "rejected",
    verification_info: { ...(claim.verification_info || {}), rejection_reason: reason || null },
  }).eq("id", claimId);

  await db.from("restaurants").update({
    claimed_by_user_id: null,
    owner_id: null,
    claim_status: "rejected",
    partner_status: "unclaimed",
    updated_at: new Date().toISOString(),
  }).eq("restaurant_id", claim.restaurant_id).eq("claimed_by_user_id", claim.user_id);

  return { ok: true, claim_id: claimId, restaurant_id: claim.restaurant_id };
}

async function featurePartner(db: SupabaseClient, restaurantId: string) {
  const { data: restaurant } = await db
    .from("restaurants")
    .select("restaurant_id,partner_status,merchant_verified")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!restaurant) throwErr("Restaurant not found", 404);
  if (!restaurant.merchant_verified && normalizePartnerStatus(restaurant.partner_status) === "unclaimed") {
    throwErr("Restaurant must be a verified partner before featuring", 400);
  }

  await db.from("restaurants").update({
    partner_status: "featured_partner",
    updated_at: new Date().toISOString(),
  }).eq("restaurant_id", restaurantId);

  return { ok: true, restaurant_id: restaurantId, partner_status: "featured_partner" };
}

async function removePartnerStatus(db: SupabaseClient, restaurantId: string) {
  const { data: restaurant } = await db
    .from("restaurants")
    .select("restaurant_id,merchant_verified,owner_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!restaurant) throwErr("Restaurant not found", 404);

  const nextStatus = restaurant.merchant_verified || restaurant.owner_id ? "verified_partner" : "unclaimed";
  await db.from("restaurants").update({
    partner_status: nextStatus,
    updated_at: new Date().toISOString(),
  }).eq("restaurant_id", restaurantId);

  return { ok: true, restaurant_id: restaurantId, partner_status: nextStatus };
}

export async function handlePartnerRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (path === "/restaurants/listings" && method === "GET") {
    return listRestaurantListings(db, params);
  }

  if (path === "/restaurant-claims" && method === "POST") {
    const user = ctx.requireAuth();
    return submitRestaurantClaim(db, user, body);
  }

  if (path === "/restaurant-claims/me" && method === "GET") {
    const user = ctx.requireAuth();
    const { data } = await db
      .from("restaurant_claims")
      .select("*")
      .eq("user_id", user.user_id)
      .order("created_at", { ascending: false });
    return enrichClaimsWithRestaurants(db, data || []);
  }

  if (path === "/admin/partners/analytics" && method === "GET") {
    ctx.requireRole("admin");
    return getPartnerAnalytics(db);
  }

  if (path === "/admin/partners" && method === "GET") {
    ctx.requireRole("admin");
    const status = params.status;
    const filter = params.filter;

    let restQuery = db
      .from("restaurants")
      .select(`${LISTING_FIELDS},phone,approved,onboarding_complete,created_at`)
      .not("name", "ilike", "TEST_%")
      .order("name", { ascending: true })
      .limit(500);

    if (status) restQuery = restQuery.eq("partner_status", status);
    if (filter === "claimed") restQuery = restQuery.not("claimed_by_user_id", "is", null);
    if (filter === "unclaimed") restQuery = restQuery.eq("partner_status", "unclaimed");
    if (filter === "featured") restQuery = restQuery.eq("partner_status", "featured_partner");

    const [{ data: restaurants }, { data: claims }] = await Promise.all([
      restQuery,
      db
        .from("restaurant_claims")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const enrichedClaims = await enrichClaimsWithRestaurants(db, claims || []);
    const analytics = await getPartnerAnalytics(db);

    return {
      analytics,
      restaurants: restaurants || [],
      claims: enrichedClaims,
      pending_claims: enrichedClaims.filter((c) => (c as { verification_status?: string }).verification_status === "pending"),
    };
  }

  const approveClaimMatch = path.match(/^\/admin\/restaurant-claims\/([^/]+)\/approve$/);
  if (approveClaimMatch && method === "POST") {
    const admin = ctx.requireRole("admin");
    return approveRestaurantClaim(db, admin, approveClaimMatch[1]);
  }

  const rejectClaimMatch = path.match(/^\/admin\/restaurant-claims\/([^/]+)\/reject$/);
  if (rejectClaimMatch && method === "POST") {
    ctx.requireRole("admin");
    return rejectRestaurantClaim(db, rejectClaimMatch[1], body.reason ? String(body.reason) : undefined);
  }

  const featureMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/feature-partner$/);
  if (featureMatch && method === "POST") {
    ctx.requireRole("admin");
    return featurePartner(db, featureMatch[1]);
  }

  const removePartnerMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/remove-partner$/);
  if (removePartnerMatch && method === "POST") {
    ctx.requireRole("admin");
    return removePartnerStatus(db, removePartnerMatch[1]);
  }

  return null;
}
