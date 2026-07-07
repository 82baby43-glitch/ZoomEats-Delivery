/**
 * OpenStreetMap bulk restaurant import — free alternative to Google Places.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  RESTAURANT_PLACEHOLDER_IMAGE,
  sanitizeImportString,
  type ImportParams,
} from "./googlePlacesImport.ts";
import { parseOsmOpeningHours } from "./osmOpeningHours.ts";
import { resolveOsmPhotoUrl } from "./osmPhoto.ts";

type OsmTags = Record<string, string>;

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

const NOMINATIM_UA = "ZoomEats/1.0 (restaurant-import)";
const OVERPASS_UA = NOMINATIM_UA;
const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function getOverpassEndpoints(): string[] {
  const custom = Deno.env.get("OVERPASS_API_URL");
  if (custom) {
    return [custom, ...DEFAULT_OVERPASS_ENDPOINTS.filter((url) => url !== custom)];
  }
  return DEFAULT_OVERPASS_ENDPOINTS;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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

async function geocodeCityNominatim(city: string, state: string): Promise<{ lat: number; lng: number }> {
  const query = `${city}, ${state}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: {
        "User-Agent": NOMINATIM_UA,
        Accept: "application/json",
      },
    },
    "nominatim"
  );
  const data = await res.json();
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit?.lat || !hit?.lon) {
    throw new Error(`Could not geocode ${city}, ${state} via Nominatim`);
  }
  return { lat: Number(hit.lat), lng: Number(hit.lon) };
}

function buildOverpassQuery(lat: number, lng: number, radiusMeters: number): string {
  return `[out:json][timeout:60];
(
  node["amenity"~"restaurant|cafe|fast_food|bar|biergarten|food_court|ice_cream"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"restaurant|cafe|fast_food|bar|biergarten|food_court|ice_cream"](around:${radiusMeters},${lat},${lng});
);
out center tags;`;
}

async function queryOverpass(lat: number, lng: number, radiusMeters: number): Promise<OsmElement[]> {
  const query = buildOverpassQuery(lat, lng, radiusMeters);
  const body = `data=${encodeURIComponent(query)}`;
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": OVERPASS_UA,
    Accept: "application/json, */*",
  };

  let lastError: Error | null = null;
  for (const endpoint of getOverpassEndpoints()) {
    try {
      const res = await fetchWithRetry(
        endpoint,
        { method: "POST", headers, body },
        "overpass"
      );
      const data = await res.json();
      return (data.elements ?? []) as OsmElement[];
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("overpass: all endpoints failed");
}

function elementCoords(el: OsmElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.center?.lat != null && el.center?.lon != null) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildOsmAddress(tags: OsmTags, city: string, state: string): string {
  if (tags["addr:full"]) return tags["addr:full"];
  const parts: string[] = [];
  if (tags["addr:housenumber"] && tags["addr:street"]) {
    parts.push(`${tags["addr:housenumber"]} ${tags["addr:street"]}`);
  } else if (tags["addr:street"]) {
    parts.push(tags["addr:street"]);
  }
  const locality = tags["addr:city"] || tags["addr:place"] || city;
  const st = tags["addr:state"] || state;
  if (locality) parts.push(locality);
  if (st) parts.push(st);
  if (tags["addr:postcode"]) parts.push(tags["addr:postcode"]);
  return parts.join(", ") || `${city}, ${state}`;
}

function osmPlaceId(el: OsmElement): string {
  return `${el.type}/${el.id}`;
}

function mapElementToRow(
  el: OsmElement,
  city: string,
  state: string,
  now: string
): Record<string, unknown> | null {
  const tags = el.tags ?? {};
  const name = sanitizeImportString(tags.name, 200);
  if (!name) return null;

  const coords = elementCoords(el);
  if (!coords) return null;

  const amenity = sanitizeImportString(tags.amenity, 80).toLowerCase();
  const cuisineTag = sanitizeImportString(tags.cuisine, 120);
  const primaryCategory = cuisineTag || amenity || "restaurant";
  const cuisine = cuisineTag || amenity || "Restaurant";
  const photoUrl = resolveOsmPhotoUrl(tags) || RESTAURANT_PLACEHOLDER_IMAGE;
  const hoursRaw = tags.opening_hours || tags["opening_hours:covid19"] || "";
  const openingHours = hoursRaw ? parseOsmOpeningHours(hoursRaw) : null;

  return {
    osm_place_id: osmPlaceId(el),
    import_source: "osm",
    name,
    address: sanitizeImportString(buildOsmAddress(tags, city, state), 400),
    latitude: coords.lat,
    longitude: coords.lng,
    phone: sanitizeImportString(tags.phone || tags["contact:phone"], 40),
    website: sanitizeImportString(tags.website || tags["contact:website"], 500),
    primary_category: sanitizeImportString(primaryCategory, 80),
    cuisine: sanitizeImportString(cuisine, 80),
    opening_hours: openingHours,
    image_url: photoUrl,
    cover_url: photoUrl,
    description: `Imported from OpenStreetMap — ${primaryCategory} in ${city}, ${state}.`,
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

export async function runOpenStreetMapImport(db: SupabaseClient, params: ImportParams): Promise<void> {
  const stats = { found: 0, imported: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await updateImportLog(db, params.importId, { status: "running", progress_pct: 5 });

    const center = await geocodeCityNominatim(params.city, params.state);
    await sleep(1000);

    const elements = await queryOverpass(center.lat, center.lng, params.radiusMeters);

    const withDistance: Array<{ el: OsmElement; dist: number }> = [];
    for (const el of elements) {
      const coords = elementCoords(el);
      if (!coords || !el.tags?.name) continue;
      withDistance.push({
        el,
        dist: haversineMeters(center.lat, center.lng, coords.lat, coords.lng),
      });
    }

    withDistance.sort((a, b) => a.dist - b.dist);
    const selected = withDistance.slice(0, params.limit).map((x) => x.el);

    stats.found = selected.length;
    await updateImportLog(db, params.importId, {
      found_count: stats.found,
      progress_pct: 20,
    });

    const now = new Date().toISOString();
    const batchSize = 10;

    for (let i = 0; i < selected.length; i++) {
      const el = selected[i];
      try {
        const osmId = osmPlaceId(el);
        const row = mapElementToRow(el, params.city, params.state, now);
        if (!row) {
          stats.skipped++;
          continue;
        }

        const { data: existing } = await db
          .from("restaurants")
          .select("restaurant_id")
          .eq("osm_place_id", osmId)
          .maybeSingle();

        if (existing?.restaurant_id) {
          const { error } = await db
            .from("restaurants")
            .update({
              address: row.address,
              latitude: row.latitude,
              longitude: row.longitude,
              phone: row.phone,
              website: row.website,
              primary_category: row.primary_category,
              cuisine: row.cuisine,
              opening_hours: row.opening_hours,
              image_url: row.image_url,
              cover_url: row.cover_url,
              import_source: "osm",
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

      if ((i + 1) % batchSize === 0 || i === selected.length - 1) {
        const pct = 20 + Math.round(((i + 1) / Math.max(selected.length, 1)) * 75);
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
