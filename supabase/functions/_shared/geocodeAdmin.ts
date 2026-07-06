import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { geocodeAddress, geocodeRestaurant } from "./geocode.ts";

type AdminCtx = {
  path: string;
  method: string;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

export async function geocodeOrderAddress(address: string, customerName?: string) {
  if (!address?.trim()) return null;
  try {
    return await geocodeAddress(address, { name: customerName });
  } catch {
    return null;
  }
}

export async function handleGeocodeAdminRequest(
  db: SupabaseClient,
  ctx: AdminCtx
): Promise<unknown | null> {
  const { path, method, requireRole } = ctx;
  if (!path.startsWith("/admin/geocode")) return null;

  requireRole("admin");

  if (path === "/admin/geocode-restaurants" && method === "POST") {
    const { data: restaurants } = await db
      .from("restaurants")
      .select("restaurant_id,name,address,state,latitude,longitude")
      .eq("approved", true);

    const results: Array<Record<string, unknown>> = [];
    for (const rest of restaurants || []) {
      if (rest.latitude != null && rest.longitude != null && rest.address?.trim()) {
        results.push({ restaurant_id: rest.restaurant_id, name: rest.name, skipped: true, reason: "already_geocoded" });
        continue;
      }

      const hit = await geocodeRestaurant(rest);
      if (!hit) {
        results.push({ restaurant_id: rest.restaurant_id, name: rest.name, ok: false, reason: "geocode_failed" });
        continue;
      }

      const patch: Record<string, unknown> = {
        latitude: hit.latitude,
        longitude: hit.longitude,
        address_validated: true,
        updated_at: new Date().toISOString(),
      };
      if (hit.formatted_address && (!rest.address || rest.address.length < 8)) {
        patch.address = hit.formatted_address;
      }

      await db.from("restaurants").update(patch).eq("restaurant_id", rest.restaurant_id);
      results.push({
        restaurant_id: rest.restaurant_id,
        name: rest.name,
        ok: true,
        latitude: hit.latitude,
        longitude: hit.longitude,
        source: hit.source,
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => r.ok === false).length;
    const skipped = results.filter((r) => r.skipped).length;
    return { ok: true, geocoded: ok, failed, skipped, results };
  }

  return null;
}
