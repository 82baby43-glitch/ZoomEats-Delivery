/** Server-side address geocoding — Deno edge mirror of lib/server/geocode.ts */

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formatted_address?: string;
  source: "google" | "nominatim";
};

export type GeocodeProviderMode = "auto" | "google" | "nominatim";

function getGeocodeProvider(): GeocodeProviderMode {
  const raw = (Deno.env.get("GEOCODE_PROVIDER") || "auto").toLowerCase();
  if (raw === "google" || raw === "nominatim") return raw;
  return "auto";
}

function getGoogleApiKey(): string {
  return (
    Deno.env.get("GOOGLE_PLACES_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    Deno.env.get("GOOGLE_API_KEY") ||
    ""
  );
}

function getNominatimBaseUrl(): string {
  return (Deno.env.get("NOMINATIM_API_URL") || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
}

function defaultRegion(): string {
  return Deno.env.get("DEFAULT_GEOCODE_REGION") || "Columbia, MO, USA";
}

function buildQueries(address: string, name?: string): string[] {
  const trimmed = (address || "").trim();
  const region = defaultRegion();
  const queries: string[] = [];
  if (trimmed) {
    if (!/,\s*[A-Z]{2}/i.test(trimmed)) queries.push(`${trimmed}, ${region}`);
    queries.push(trimmed);
    if (name) queries.push(`${name}, ${trimmed}, ${region}`);
    if (name && !/,/.test(trimmed)) queries.push(`${name}, ${region}`);
  } else if (name) {
    queries.push(`${name}, ${region}`);
  }
  return [...new Set(queries.filter(Boolean))];
}

async function geocodeWithGoogle(query: string, apiKey: string): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  const result = data?.results?.[0];
  const loc = result?.geometry?.location;
  if (!loc?.lat || !loc?.lng) return null;
  return {
    latitude: Number(loc.lat),
    longitude: Number(loc.lng),
    formatted_address: result.formatted_address,
    source: "google",
  };
}

async function geocodeWithNominatim(query: string): Promise<GeocodeResult | null> {
  const url = `${getNominatimBaseUrl()}/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "ZoomEats/1.0 (launch-geocode)",
      Accept: "application/json",
    },
  });
  const data = await res.json().catch(() => []);
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit?.lat || !hit?.lon) return null;
  return {
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
    formatted_address: hit.display_name,
    source: "nominatim",
  };
}

export async function geocodeAddress(
  address: string,
  opts: { name?: string } = {}
): Promise<GeocodeResult | null> {
  const queries = buildQueries(address, opts.name);
  if (!queries.length) return null;

  const provider = getGeocodeProvider();
  const googleKey = getGoogleApiKey();

  for (const query of queries) {
    if (provider === "google") {
      if (!googleKey) return null;
      const hit = await geocodeWithGoogle(query, googleKey);
      if (hit) return hit;
      continue;
    }

    if (provider === "nominatim") {
      const hit = await geocodeWithNominatim(query);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    if (googleKey) {
      const hit = await geocodeWithGoogle(query, googleKey);
      if (hit) return hit;
    }
    const hit = await geocodeWithNominatim(query);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export async function geocodeRestaurant(row: {
  name?: string;
  address?: string | null;
  state?: string | null;
}): Promise<GeocodeResult | null> {
  const address = (row.address || "").trim();
  const state = (row.state || "").trim();
  const base = address || row.name || "";
  if (!base) return null;

  let query = base;
  if (address && state && !address.toLowerCase().includes(state.toLowerCase())) {
    query = `${address}, ${state}, USA`;
  }
  return geocodeAddress(query, { name: row.name });
}
