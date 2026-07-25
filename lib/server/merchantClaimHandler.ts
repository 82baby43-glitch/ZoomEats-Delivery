import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGooglePlacesApiKey } from "./googlePlacesClaim";
import {
  approveMerchantClaim,
  getMyClaimStatus,
  listMerchantClaims,
  lookupClaimablePlace,
  rejectMerchantClaim,
  searchClaimableBusinesses,
  submitBusinessClaim,
  updateMerchantClaimInfo,
} from "../merchant/claim";

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

export async function handleMerchantClaimRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (!path.startsWith("/claim") && !path.startsWith("/admin/merchant-claims")) {
    return null;
  }

  if (path === "/claim/config" && method === "GET") {
    return { google_places_enabled: hasGooglePlacesApiKey() };
  }

  if (path === "/claim/search" && method === "POST") {
    ctx.requireAuth();
    if (!hasGooglePlacesApiKey()) throwErr("Google Places is not configured", 503);
    return searchClaimableBusinesses({
      query: String(body.query || ""),
      city: body.city ? String(body.city) : undefined,
      state: body.state ? String(body.state) : undefined,
      latitude: body.latitude != null ? Number(body.latitude) : undefined,
      longitude: body.longitude != null ? Number(body.longitude) : undefined,
    });
  }

  const lookupMatch = path.match(/^\/claim\/place\/([^/]+)$/);
  if (lookupMatch && method === "GET") {
    ctx.requireAuth();
    if (!hasGooglePlacesApiKey()) throwErr("Google Places is not configured", 503);
    return lookupClaimablePlace(db, decodeURIComponent(lookupMatch[1]));
  }

  if (path === "/claim/submit" && method === "POST") {
    const user = ctx.requireAuth();
    const googlePlaceId = String(body.google_place_id || "");
    if (!googlePlaceId) throwErr("google_place_id required");
    return submitBusinessClaim(db, String(user.user_id), {
      google_place_id: googlePlaceId,
      merchant_notes: body.merchant_notes ? String(body.merchant_notes) : undefined,
    });
  }

  if (path === "/claim/my" && method === "GET") {
    const user = ctx.requireAuth();
    return getMyClaimStatus(db, String(user.user_id));
  }

  if (path === "/admin/merchant-claims" && method === "GET") {
    ctx.requireRole("admin");
    return listMerchantClaims(db, {
      status: params.status || (body.status as string | undefined),
      category: params.category || (body.category as string | undefined),
      q: params.q || (body.q as string | undefined),
    });
  }

  const approveMatch = path.match(/^\/admin\/merchant-claims\/([^/]+)\/approve$/);
  if (approveMatch && method === "POST") {
    const admin = ctx.requireRole("admin");
    return approveMerchantClaim(db, approveMatch[1], String(admin.user_id));
  }

  const rejectMatch = path.match(/^\/admin\/merchant-claims\/([^/]+)\/reject$/);
  if (rejectMatch && method === "POST") {
    const admin = ctx.requireRole("admin");
    return rejectMerchantClaim(
      db,
      rejectMatch[1],
      String(admin.user_id),
      body.admin_notes ? String(body.admin_notes) : undefined
    );
  }

  const restaurantMatch = path.match(/^\/admin\/merchant-claims\/restaurants\/([^/]+)$/);
  if (restaurantMatch && method === "PATCH") {
    ctx.requireRole("admin");
    return updateMerchantClaimInfo(db, restaurantMatch[1], body);
  }

  throwErr("Merchant claim route not found", 404);
}
