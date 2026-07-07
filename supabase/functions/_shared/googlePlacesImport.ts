/**
 * Google Places bulk restaurant import — server-side only (never expose API key).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const RESTAURANT_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1624272823876-470c7f48c8c0?crop=entropy&cs=srgb&fm=jpg&q=85&w=800";

const FOOD_TYPES = new Set([
  "restaurant",
  "cafe",
  "bakery",
  "bar",
  "meal_takeaway",
  "meal_delivery",
  "food",
  "fast_food_restaurant",
  "pizza_restaurant",
  "coffee_shop",
  "ice_cream_shop",
]);

const NEARBY_TYPES = ["restaurant", "cafe", "bakery", "meal_takeaway", "bar", "fast_food_restaurant"];

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
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

export interface ImportParams {
  city: string;
  state: string;
  radiusMeters: number;
  limit: number;
  importId: string;
  userId: string;
}

export interface ImportProgress {
  import_id: string;
  status: string;
  found: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  progress_pct: number;
  error_message?: string | null;
}

type PlaceRow = Record<string, unknown>;

function getApiKey(): string {
  return (
    Deno.env.get("GOOGLE_PLACES_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    Deno.env.get("GOOGLE_API_KEY") ||
    ""
  );
}

export function hasGooglePlacesApiKey(): boolean {
  return !!getApiKey();
}

export function parseImportProvider(raw: unknown): "osm" | "google" {
  const normalized = sanitizeImportString(raw, 30).toLowerCase();
  if (normalized === "osm" || normalized === "openstreetmap" || normalized === "open_street_map") {
    return "osm";
  }
  if (normalized === "google" || normalized === "google_places") {
    return "google";
  }
  return "google";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function sanitizeImportString(value: unknown, maxLen = 500): string {
  if (value == null) return "";
  const s = String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  return s.slice(0, maxLen);
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function priceLevelToInt(level: unknown): number | null {
  if (typeof level === "number") return level;
  if (typeof level !== "string") return null;
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? null;
}

function isFoodPlace(place: PlaceRow): boolean {
  const primary = sanitizeImportString(place.primaryType, 80).toLowerCase();
  if (primary && FOOD_TYPES.has(primary)) return true;
  const types = Array.isArray(place.types) ? place.types : [];
  return types.some((t) => FOOD_TYPES.has(String(t).toLowerCase()));
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

export function buildPhotoUrl(_apiKey: string, photoName: string): string {
  if (!photoName) return RESTAURANT_PLACEHOLDER_IMAGE;
  return `/api/places-photo?name=${encodeURIComponent(photoName)}`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  retries = 4
): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    last = res;
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      await sleep(Math.min(8000, 1000 * Math.pow(2, attempt)));
      continue;
    }
    const body = await res.text();
    throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  throw new Error(`${label}: HTTP ${last?.status ?? "unknown"} after retries`);
}

async function geocodeCity(apiKey: string, city: string, state: string): Promise<{ lat: number; lng: number }> {
  const address = encodeURIComponent(`${city}, ${state}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${apiKey}`;
  const res = await fetchWithRetry(url, { method: "GET" }, "geocode");
  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  if (!loc?.lat || !loc?.lng) {
    throw new Error(`Could not geocode ${city}, ${state}`);
  }
  return { lat: Number(loc.lat), lng: Number(loc.lng) };
}

async function searchNearbyPage(
  apiKey: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  pageToken?: string
): Promise<{ places: PlaceRow[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = {
    includedTypes: NEARBY_TYPES,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    },
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetchWithRetry(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
    "searchNearby"
  );
  const data = await res.json();
  return {
    places: (data.places ?? []) as PlaceRow[],
    nextPageToken: data.nextPageToken as string | undefined,
  };
}

async function searchTextPage(
  apiKey: string,
  query: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  pageToken?: string
): Promise<{ places: PlaceRow[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = {
    textQuery: query,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    },
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetchWithRetry(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
    "searchText"
  );
  const data = await res.json();
  return {
    places: (data.places ?? []) as PlaceRow[],
    nextPageToken: data.nextPageToken as string | undefined,
  };
}

async function collectPlaces(
  apiKey: string,
  city: string,
  state: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  limit: number
): Promise<PlaceRow[]> {
  const byId = new Map<string, PlaceRow>();

  const addPlaces = (list: PlaceRow[]) => {
    for (const p of list) {
      if (!isFoodPlace(p)) continue;
      const id = placeIdFromResource(p.id);
      if (!id || byId.has(id)) continue;
      byId.set(id, p);
      if (byId.size >= limit) return;
    }
  };

  let token: string | undefined;
  do {
    const page = await searchNearbyPage(apiKey, center, radiusMeters, token);
    addPlaces(page.places);
    token = page.nextPageToken;
    if (byId.size >= limit) break;
    if (token) await sleep(1200);
  } while (token && byId.size < limit);

  const textQueries = [
    `restaurants in ${city} ${state}`,
    `food in ${city} ${state}`,
    `cafes in ${city} ${state}`,
  ];

  for (const query of textQueries) {
    if (byId.size >= limit) break;
    token = undefined;
    do {
      const page = await searchTextPage(apiKey, query, center, radiusMeters, token);
      addPlaces(page.places);
      token = page.nextPageToken;
      if (byId.size >= limit) break;
      if (token) await sleep(1200);
    } while (token && byId.size < limit);
  }

  return [...byId.values()].slice(0, limit);
}

function mapPlaceToRow(
  place: PlaceRow,
  apiKey: string,
  city: string,
  state: string,
  now: string
): Record<string, unknown> {
  const googlePlaceId = placeIdFromResource(place.id);
  const photoRef = photoReference(place.photos);
  const imageUrl = photoRef ? buildPhotoUrl(apiKey, photoRef) : RESTAURANT_PLACEHOLDER_IMAGE;
  const displayName = place.displayName as { text?: string } | undefined;
  const name = sanitizeImportString(displayName?.text ?? "Restaurant", 200);
  const primaryCategory = sanitizeImportString(place.primaryType, 80);

  return {
    google_place_id: googlePlaceId,
    name,
    address: sanitizeImportString(place.formattedAddress, 400),
    latitude: Number((place.location as { latitude?: number })?.latitude ?? 0),
    longitude: Number((place.location as { longitude?: number })?.longitude ?? 0),
    phone: sanitizeImportString(place.internationalPhoneNumber ?? place.nationalPhoneNumber, 40),
    website: sanitizeImportString(place.websiteUri, 500),
    rating: Number(place.rating ?? 0) || null,
    total_reviews: Number(place.userRatingCount ?? 0) || 0,
    price_level: priceLevelToInt(place.priceLevel),
    business_status: sanitizeImportString(place.businessStatus, 40),
    opening_hours: place.currentOpeningHours ?? null,
    primary_category: primaryCategory,
    google_photo_reference: photoRef,
    image_url: imageUrl,
    cover_url: imageUrl,
    cuisine: primaryCategory || "Restaurant",
    description: `Imported from Google Places — ${primaryCategory || "restaurant"} in ${city}, ${state}.`,
    state: sanitizeImportString(state, 80),
    delivery_enabled: false,
    active: false,
    approved: false,
    delivery_time_min: 30,
    updated_at: now,
  };
}

async function updateImportLog(db: SupabaseClient, importId: string, patch: Record<string, unknown>) {
  await db.from("restaurant_import_logs").update(patch).eq("import_id", importId);
}

export async function runGooglePlacesImport(db: SupabaseClient, params: ImportParams): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    await updateImportLog(db, params.importId, {
      status: "failed",
      error_message: "GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) not configured",
      completed_at: new Date().toISOString(),
    });
    return;
  }

  const stats = { found: 0, imported: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await updateImportLog(db, params.importId, { status: "running", progress_pct: 5 });

    const center = await geocodeCity(apiKey, params.city, params.state);
    const places = await collectPlaces(
      apiKey,
      params.city,
      params.state,
      center,
      params.radiusMeters,
      params.limit
    );

    stats.found = places.length;
    await updateImportLog(db, params.importId, {
      found_count: stats.found,
      progress_pct: 20,
    });

    const now = new Date().toISOString();
    const batchSize = 10;

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      try {
        const googlePlaceId = placeIdFromResource(place.id);
        if (!googlePlaceId) {
          stats.skipped++;
          continue;
        }

        const row = mapPlaceToRow(place, apiKey, params.city, params.state, now);
        const { data: existing } = await db
          .from("restaurants")
          .select("restaurant_id")
          .eq("google_place_id", googlePlaceId)
          .maybeSingle();

        if (existing?.restaurant_id) {
          const { error } = await db
            .from("restaurants")
            .update({
              rating: row.rating,
              phone: row.phone,
              address: row.address,
              opening_hours: row.opening_hours,
              google_photo_reference: row.google_photo_reference,
              image_url: row.image_url,
              cover_url: row.cover_url,
              website: row.website,
              total_reviews: row.total_reviews,
              price_level: row.price_level,
              business_status: row.business_status,
              primary_category: row.primary_category,
              latitude: row.latitude,
              longitude: row.longitude,
              updated_at: now,
            })
            .eq("restaurant_id", existing.restaurant_id);

          if (error) stats.failed++;
          else stats.updated++;
        } else {
          const { error } = await db.from("restaurants").insert({
            restaurant_id: uid("rest"),
            owner_id: null,
            created_at: now,
            ...row,
          });
          if (error) stats.failed++;
          else stats.imported++;
        }
      } catch {
        stats.failed++;
      }

      if ((i + 1) % batchSize === 0 || i === places.length - 1) {
        const pct = 20 + Math.round(((i + 1) / Math.max(places.length, 1)) * 75);
        await updateImportLog(db, params.importId, {
          imported_count: stats.imported,
          updated_count: stats.updated,
          skipped_count: stats.skipped,
          failed_count: stats.failed,
          progress_pct: Math.min(pct, 99),
        });
        await sleep(300);
      }
    }

    await updateImportLog(db, params.importId, {
      status: "complete",
      found_count: stats.found,
      imported_count: stats.imported,
      updated_count: stats.updated,
      skipped_count: stats.skipped,
      failed_count: stats.failed,
      progress_pct: 100,
      completed_at: new Date().toISOString(),
    });
  } catch (e) {
    await updateImportLog(db, params.importId, {
      status: "failed",
      found_count: stats.found,
      imported_count: stats.imported,
      updated_count: stats.updated,
      skipped_count: stats.skipped,
      failed_count: stats.failed,
      error_message: e instanceof Error ? e.message : String(e),
      completed_at: new Date().toISOString(),
    });
  }
}

export async function getImportProgress(db: SupabaseClient, importId: string): Promise<ImportProgress | null> {
  const { data } = await db.from("restaurant_import_logs").select("*").eq("import_id", importId).maybeSingle();
  if (!data) return null;
  return {
    import_id: data.import_id,
    status: data.status,
    found: data.found_count ?? 0,
    imported: data.imported_count ?? 0,
    updated: data.updated_count ?? 0,
    skipped: data.skipped_count ?? 0,
    failed: data.failed_count ?? 0,
    progress_pct: Number(data.progress_pct ?? 0),
    error_message: data.error_message,
  };
}

export function newImportId() {
  return uid("imp");
}
