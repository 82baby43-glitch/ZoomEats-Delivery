import type { SupabaseClient } from "@supabase/supabase-js";
import type { MerchantCategory } from "./types";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

type HandlerCtx = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function mapCategory(row: Record<string, unknown>): MerchantCategory {
  return {
    category_id: String(row.category_id),
    slug: String(row.slug),
    label: String(row.label),
    icon: String(row.icon || "🏪"),
    color: String(row.color || "#B6F127"),
    enabled: row.enabled === true,
    visible: row.visible !== false,
    custom: row.custom === true,
    sort_order: Number(row.sort_order) || 100,
    delivery_enabled: row.delivery_enabled !== false,
    pickup_enabled: row.pickup_enabled !== false,
    onboarding_requirements: (row.onboarding_requirements as Record<string, unknown>) || {},
    compliance_settings: (row.compliance_settings as Record<string, unknown>) || {},
    product_field_config: (row.product_field_config as Record<string, unknown>) || {},
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

async function listCategories(db: SupabaseClient, opts: { enabledOnly?: boolean; visibleOnly?: boolean }) {
  let q = db.from("merchant_categories").select("*").order("sort_order", { ascending: true });
  if (opts.enabledOnly) q = q.eq("enabled", true);
  if (opts.visibleOnly) q = q.eq("visible", true);
  const { data, error } = await q;
  if (error) throwErr(error.message, 500);
  return (data || []).map((r) => mapCategory(r as Record<string, unknown>));
}

async function marketplaceSearch(db: SupabaseClient, query: string, limit = 24) {
  const q = query.trim();
  if (!q) return { query: q, merchants: [], products: [], categories: [] };

  const { data: enabledCats } = await db
    .from("merchant_categories")
    .select("slug, label, icon")
    .eq("enabled", true)
    .eq("visible", true);

  const enabledSlugs = (enabledCats || []).map((c) => c.slug as string);
  const categoryMatches = (enabledCats || []).filter(
    (c) =>
      String(c.label || "").toLowerCase().includes(q.toLowerCase()) ||
      String(c.slug || "").toLowerCase().includes(q.toLowerCase())
  );

  const pattern = `%${q}%`;
  let merchantQuery = db
    .from("restaurants")
    .select("restaurant_id,name,description,cuisine,image_url,rating,merchant_category_slug,primary_category")
    .eq("approved", true)
    .eq("active", true)
    .not("name", "ilike", "TEST_%")
    .or(`name.ilike.${pattern},description.ilike.${pattern},cuisine.ilike.${pattern},primary_category.ilike.${pattern}`)
    .limit(limit);

  if (enabledSlugs.length) {
    merchantQuery = merchantQuery.in("merchant_category_slug", enabledSlugs);
  }

  const { data: merchants } = await merchantQuery;

  const productQuery = db
    .from("menu_items")
    .select("item_id,name,description,price,image_url,category,product_category,brand,featured,restaurant_id")
    .eq("available", true)
    .or(`name.ilike.${pattern},description.ilike.${pattern},category.ilike.${pattern},product_category.ilike.${pattern},brand.ilike.${pattern}`)
    .limit(limit * 2);

  const { data: rawProducts } = await productQuery;

  let products = rawProducts || [];
  if (enabledSlugs.length && products.length) {
    const restIds = [...new Set(products.map((p) => p.restaurant_id).filter(Boolean))];
    const { data: rests } = await db
      .from("restaurants")
      .select("restaurant_id,name,merchant_category_slug")
      .in("restaurant_id", restIds)
      .in("merchant_category_slug", enabledSlugs);
    const allowed = new Set((rests || []).map((r) => r.restaurant_id));
    const nameMap = Object.fromEntries((rests || []).map((r) => [r.restaurant_id, r.name]));
    products = products
      .filter((p) => allowed.has(p.restaurant_id))
      .slice(0, limit)
      .map((p) => ({ ...p, restaurants: { name: nameMap[p.restaurant_id], merchant_category_slug: enabledSlugs[0] } }));
  } else {
    products = products.slice(0, limit);
  }

  return {
    query: q,
    merchants: merchants || [],
    products,
    categories: categoryMatches.map((c) => ({
      slug: c.slug,
      label: c.label,
      icon: c.icon,
    })),
  };
}

export async function handleMarketplaceRequest(db: SupabaseClient, ctx: HandlerCtx): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = ctx;

  if (path === "/marketplace/categories" && method === "GET") {
    return listCategories(db, { enabledOnly: true, visibleOnly: true });
  }

  if (path === "/marketplace/search" && method === "GET") {
    const q = String(params.q || "").slice(0, 120);
    return marketplaceSearch(db, q);
  }

  if (path === "/marketplace/favorites" && method === "GET") {
    const u = ctx.requireAuth();
    const { data } = await db
      .from("merchant_favorites")
      .select("favorite_id,restaurant_id,created_at,restaurants(restaurant_id,name,image_url,cuisine,merchant_category_slug,rating)")
      .eq("user_id", u.user_id)
      .order("created_at", { ascending: false });
    return data || [];
  }

  if (path === "/marketplace/favorites" && method === "POST") {
    const u = ctx.requireAuth();
    const restaurantId = String(body.restaurant_id || "");
    if (!restaurantId) throwErr("restaurant_id required");
    const { data, error } = await db
      .from("merchant_favorites")
      .upsert(
        { favorite_id: uid("fav"), user_id: u.user_id, restaurant_id: restaurantId },
        { onConflict: "user_id,restaurant_id" }
      )
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  const favDelete = path.match(/^\/marketplace\/favorites\/([^/]+)$/);
  if (favDelete && method === "DELETE") {
    const u = ctx.requireAuth();
    await db.from("merchant_favorites").delete().eq("user_id", u.user_id).eq("restaurant_id", favDelete[1]);
    return { ok: true };
  }

  // ---- Admin marketplace manager ----
  if (path === "/admin/marketplace/categories" && method === "GET") {
    ctx.requireRole("admin");
    return listCategories(db, {});
  }

  if (path === "/admin/marketplace/categories" && method === "POST") {
    ctx.requireRole("admin");
    const label = String(body.label || "").trim();
    if (!label) throwErr("label required");
    const slug = slugify(String(body.slug || label));
    if (!slug) throwErr("invalid slug");
    const row = {
      category_id: uid("cat"),
      slug,
      label,
      icon: String(body.icon || "🏪").slice(0, 8),
      color: String(body.color || "#B6F127").slice(0, 32),
      enabled: body.enabled === true,
      visible: body.visible !== false,
      custom: true,
      sort_order: Number(body.sort_order) || 200,
      delivery_enabled: body.delivery_enabled !== false,
      pickup_enabled: body.pickup_enabled !== false,
      onboarding_requirements: body.onboarding_requirements || {},
      compliance_settings: body.compliance_settings || {},
      product_field_config: body.product_field_config || {},
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("merchant_categories").insert(row).select().single();
    if (error) throwErr(error.message, 500);
    return mapCategory(data as Record<string, unknown>);
  }

  const catPatch = path.match(/^\/admin\/marketplace\/categories\/([^/]+)$/);
  if (catPatch && method === "PATCH") {
    ctx.requireRole("admin");
    const slug = catPatch[1];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = [
      "label", "icon", "color", "enabled", "visible", "sort_order",
      "delivery_enabled", "pickup_enabled", "onboarding_requirements",
      "compliance_settings", "product_field_config",
    ] as const;
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    const { data, error } = await db
      .from("merchant_categories")
      .update(updates)
      .eq("slug", slug)
      .select()
      .maybeSingle();
    if (error) throwErr(error.message, 500);
    if (!data) throwErr("Category not found", 404);
    return mapCategory(data as Record<string, unknown>);
  }

  if (path === "/admin/marketplace/analytics" && method === "GET") {
    ctx.requireRole("admin");
    const { data: orders } = await db
      .from("orders")
      .select("order_id,total,status,created_at,restaurant_id,restaurants(merchant_category_slug,name)")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(5000);

    const byCategory: Record<string, { orders: number; revenue: number; merchants: Set<string> }> = {};
    for (const o of orders || []) {
      const slug = (o.restaurants as { merchant_category_slug?: string } | null)?.merchant_category_slug || "restaurants";
      if (!byCategory[slug]) byCategory[slug] = { orders: 0, revenue: 0, merchants: new Set() };
      byCategory[slug].orders += 1;
      byCategory[slug].revenue += Number(o.total) || 0;
      if (o.restaurant_id) byCategory[slug].merchants.add(String(o.restaurant_id));
    }

    return Object.entries(byCategory).map(([slug, stats]) => ({
      category_slug: slug,
      orders: stats.orders,
      revenue: Math.round(stats.revenue * 100) / 100,
      merchant_count: stats.merchants.size,
    }));
  }

  return null;
}
