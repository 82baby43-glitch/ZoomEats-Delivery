import { createClient } from "@supabase/supabase-js";
import { setupTestRestaurant, createTestOrder, clearTestOrders } from "../lib/restaurant/simulator";

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const status = await setupTestRestaurant(db);
  console.log("setup", { name: status.restaurant?.name, menu: status.menu_count });
  const { order, dispatch } = await createTestOrder(db);
  console.log("order", order?.order_id, order?.status, order?.test_order);
  console.log("dispatch", dispatch);
  const cleared = await clearTestOrders(db);
  console.log("cleared", cleared);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
