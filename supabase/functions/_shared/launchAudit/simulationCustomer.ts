import type { SupabaseClient } from "@supabase/supabase-js";

const SIM_USER_ID = "user_launch_simulation";

/** Resolve a valid users.user_id for sandbox order inserts (FK-safe). */
export async function resolveSimulationCustomerId(db: SupabaseClient): Promise<string> {
  const { data: simUser } = await db.from("users").select("user_id").eq("user_id", SIM_USER_ID).maybeSingle();
  if (simUser?.user_id) return simUser.user_id;

  const { data: customer } = await db.from("users").select("user_id").eq("role", "customer").limit(1).maybeSingle();
  if (customer?.user_id) return customer.user_id;

  const { error } = await db.from("users").upsert({
    user_id: SIM_USER_ID,
    email: "launch-simulation@zoomeats.internal",
    name: "Launch Simulation Customer",
    role: "customer",
    active: true,
    approval_status: "approved",
  });
  if (!error) return SIM_USER_ID;

  const { data: fallback } = await db.from("users").select("user_id").limit(1).maybeSingle();
  if (fallback?.user_id) return fallback.user_id;

  throw new Error("No valid customer user for simulation");
}
