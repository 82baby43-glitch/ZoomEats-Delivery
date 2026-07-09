import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseDriverApis } from "../founderDriver/auth";
import {
  buildAdminLogisticsView,
  buildDriverLogisticsView,
  buildRestaurantLogisticsView,
} from "../logistics/engine";
import { handleLogisticsSafetyRequest } from "../logistics/safetyHandler";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

export async function handleLogisticsRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    requireAuth: () => Record<string, unknown>;
    requireRole: (...roles: string[]) => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method } = opts;

  const safetyResult = await handleLogisticsSafetyRequest(db, {
    path,
    method,
    body: opts.body ?? {},
    requireAuth: opts.requireAuth,
  });
  if (safetyResult !== null) return safetyResult;

  if (!path.startsWith("/logistics")) return null;
  if (method !== "GET") throwErr("Method not allowed", 405);

  if (path === "/logistics/driver") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery or founder driver access required", 403);
    }
    return buildDriverLogisticsView(db, String(u.user_id));
  }

  if (path === "/logistics/restaurant") {
    const u = opts.requireRole("vendor");
    const view = await buildRestaurantLogisticsView(db, String(u.user_id));
    if (!view) throwErr("Restaurant not found", 404);
    return view;
  }

  if (path === "/logistics/admin") {
    opts.requireRole("admin");
    return buildAdminLogisticsView(db);
  }

  throwErr("Logistics route not found", 404);
}
