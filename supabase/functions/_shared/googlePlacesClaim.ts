/**
 * Google Places search + details for merchant claim flow (server-side only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPhotoUrl,
  hasGooglePlacesApiKey,
  sanitizeImportString,
} from "./googlePlacesImport.ts";
import { mapGoogleTypesToCategories, isClaimableBusinessStatus } from "../merchant/googleCategoryMap.ts";

type PlaceRow = Record<string, unknown>;

const CLAIM_SEARCH_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "places.photos",
  "places.currentOpeningHours",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "nextPageToken",
].join(",");

const PLACE_DETAILS_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "businessStatus",
  "primaryType",
  "types",
  "photos",
  "currentOpeningHours",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
].join(",");

const LOCAL_MERCHANT_TYPES = new Set([
  "restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food",
  "fast_food_restaurant", "pizza_restaurant", "coffee_shop", "ice_cream_shop",
  "convenience_store", "liquor_store", "grocery_store", "supermarket",
  "grocery_or_supermarket", "pharmacy", "drugstore", "store", "food_truck",
  "wine_shop", "shopping_mall", "clothing_store", "home_goods_store", "gift_shop",
]);

function getApiKey(): string {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  );
}

function placeIdFromResource(id: unknown): string {
  const raw = sanitizeImportString(id, 200);
  if (!raw) return "";
  return raw.startsWith("places/") ? raw.slice("places/".length) : raw;
}

function photoReference(photos: unknown): string {
  if (!Array.isArray(photos) || !photos.length) return "";
  const first = photos[0] as { name?: string };
  return sanitizeImportString(first?.name, 300);
}

function isLocalMerchantPlace(place: PlaceRow): boolean {
  const primary = sanitizeImportString(place.primaryType, 80).toLowerCase();
  if (primary && LOCAL_MERCHANT_TYPES.has(primary)) return true;
  const types = Array.isArray(place.types) ? place.types : [];
  return types.some((t) => LOCAL_MERCHANT_TYPES.has(String(t).toLowerCase()));
}

function parseAddressParts(formattedAddress: string) {
  const parts = formattedAddress.split(",").map((p) => p.trim());
  const stateZip = parts.length >= 2 ? parts[parts.length - 2] : "";
  const stateMatch = stateZip.match(/\b([A-Z]{2})\b/);
  const zipMatch = stateZip.match(/\b(\d{5})(?:-\d{4})?\b/);
  return {
    city: parts.length >= 3 ? parts[parts.length - 3] : "",
    state: stateMatch?.[1] || "",
    zip_code: zipMatch?.[1] || "",
  };
}

export function formatPlacePreview(place: PlaceRow, apiKey: string) {
  const googlePlaceId = placeIdFromResource(place.id);
  const displayName = place.displayName as { text?: string } | undefined;
  const types = Array.isArray(place.types) ? place.types.map(String) : [];
  const { business_category, merchant_category_slug } = mapGoogleTypesToCategories(
    sanitizeImportString(place.primaryType, 80),
    types
  );
  const photoRef = photoReference(place.photos);
  const address = sanitizeImportString(place.formattedAddress, 400);
  const addrParts = parseAddressParts(address);

  return {
    google_place_id: googlePlaceId,
    name: sanitizeImportString(displayName?.text ?? "Business", 200),
    address,
    city: addrParts.city,
    state: addrParts.state,
    zip_code: addrParts.zip_code,
    phone: sanitizeImportString(place.internationalPhoneNumber ?? place.nationalPhoneNumber, 40),
    website: sanitizeImportString(place.websiteUri, 500),
    latitude: Number((place.location as { latitude?: number })?.latitude ?? 0) || null,
    longitude: Number((place.location as { longitude?: number })?.longitude ?? 0) || null,
    business_status: sanitizeImportString(place.businessStatus, 40),
    primary_category: sanitizeImportString(place.primaryType, 80),
    business_category,
    merchant_category_slug,
    opening_hours: place.currentOpeningHours ?? null,
    rating: Number(place.rating ?? 0) || null,
    total_reviews: Number(place.userRatingCount ?? 0) || 0,
    image_url: photoRef ? buildPhotoUrl(apiKey, photoRef) : null,
    claimable: isClaimableBusinessStatus(sanitizeImportString(place.businessStatus, 40)),
  };
}

export async function searchBusinessesForClaim(input: {
  query: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Google Places API is not configured");

  const query = sanitizeImportString(input.query, 200);
  if (!query) throw new Error("Search query is required");

  const locationText = [input.city, input.state].filter(Boolean).join(", ");
  const textQuery = locationText ? `${query} in ${locationText}` : query;

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 15,
  };

  if (input.latitude != null && input.longitude != null) {
    body.locationBias = {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: 25000,
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": CLAIM_SEARCH_MASK,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Places search failed (${res.status})`);
  }

  const places = ((data.places ?? []) as PlaceRow[]).filter(isLocalMerchantPlace);
  return places.map((p) => formatPlacePreview(p, apiKey));
}

export async function fetchPlaceDetailsForClaim(googlePlaceId: string) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Google Places API is not configured");
  const id = placeIdFromResource(googlePlaceId);
  if (!id) throw new Error("Invalid Google Place ID");

  const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_DETAILS_MASK,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Place details failed (${res.status})`);
  }

  return formatPlacePreview({ ...data, id: data.id || `places/${id}` }, apiKey);
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Import or refresh an unowned listing from Google Place data. */
export async function upsertClaimableListing(
  db: SupabaseClient,
  preview: ReturnType<typeof formatPlacePreview>
) {
  if (!preview.google_place_id) throw new Error("Missing google_place_id");
  if (!preview.claimable) throw new Error("This business appears closed on Google and cannot be claimed");

  const now = new Date().toISOString();
  const photoRef = preview.image_url?.includes("/api/places-photo?name=")
    ? decodeURIComponent(preview.image_url.split("name=")[1] || "")
    : "";

  const row = {
    google_place_id: preview.google_place_id,
    import_source: "google",
    imported_from_google: true,
    name: preview.name,
    address: preview.address,
    city: preview.city || null,
    state: preview.state || null,
    zip_code: preview.zip_code || null,
    latitude: preview.latitude,
    longitude: preview.longitude,
    phone: preview.phone || null,
    website: preview.website || null,
    rating: preview.rating,
    total_reviews: preview.total_reviews,
    business_status: preview.business_status,
    opening_hours: preview.opening_hours,
    primary_category: preview.primary_category,
    business_category: preview.business_category,
    merchant_category_slug: preview.merchant_category_slug,
    google_photo_reference: photoRef || null,
    image_url: preview.image_url,
    cover_url: preview.image_url,
    cuisine: preview.primary_category || preview.business_category,
    description: `Local ${preview.business_category.replace(/_/g, " ")} on ZoomEats.`,
    delivery_enabled: false,
    active: false,
    approved: false,
    claim_status: "unclaimed",
    is_local_partner: false,
    updated_at: now,
  };

  const { data: existing } = await db
    .from("restaurants")
    .select("restaurant_id, owner_id, claim_status, approved")
    .eq("google_place_id", preview.google_place_id)
    .maybeSingle();

  if (existing?.restaurant_id) {
    if (existing.owner_id) {
      return { restaurant_id: existing.restaurant_id, existing: true, owned: true, claim_status: existing.claim_status };
    }
    await db.from("restaurants").update(row).eq("restaurant_id", existing.restaurant_id);
    return { restaurant_id: existing.restaurant_id, existing: true, owned: false, claim_status: "unclaimed" };
  }

  const restaurantId = uid("rest");
  const { error } = await db.from("restaurants").insert({
    ...row,
    restaurant_id: restaurantId,
    owner_id: null,
    created_at: now,
  });
  if (error) throw new Error(error.message);
  return { restaurant_id: restaurantId, existing: false, owned: false, claim_status: "unclaimed" };
}

export { hasGooglePlacesApiKey };
