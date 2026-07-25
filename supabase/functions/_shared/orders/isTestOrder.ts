const SIMULATION_CUSTOMERS = new Set([
  "user_launch_simulation",
  "launch_audit_bot",
  "user_zoomeats_test_customer",
]);

export type TestOrderLike = {
  test_order?: boolean | null;
  order_id?: string | null;
  customer_id?: string | null;
  restaurant_id?: string | null;
};

export type TestRestaurantLike = {
  is_test_account?: boolean | null;
  restaurant_type?: string | null;
  name?: string | null;
  restaurant_id?: string | null;
};

export const TEST_RESTAURANT_ID = "rest_zoomeats_test_kitchen";
export const TEST_VENDOR_USER_ID = "user_zoomeats_test_vendor";
export const TEST_CUSTOMER_USER_ID = "user_zoomeats_test_customer";

export function isTestRestaurant(row: TestRestaurantLike | null | undefined): boolean {
  if (!row) return false;
  if (row.is_test_account) return true;
  if (row.restaurant_type === "test") return true;
  if (row.restaurant_id === TEST_RESTAURANT_ID) return true;
  return /^TEST_/i.test(String(row.name || "").trim());
}

export function isTestOrder(row: TestOrderLike | null | undefined): boolean {
  if (!row) return false;
  if (row.test_order) return true;
  const orderId = String(row.order_id || "");
  if (/^ord_(audit|launch|sim)_/i.test(orderId)) return true;
  if (SIMULATION_CUSTOMERS.has(String(row.customer_id || ""))) return true;
  return false;
}

/** Sandbox orders excluded from production ledger writes (not launch audit simulations). */
export function shouldSkipFinancialLedger(row: TestOrderLike | null | undefined): boolean {
  if (!row) return false;
  const orderId = String(row.order_id || "");
  if (/^ord_test_/i.test(orderId)) return true;
  if (/^ord_(audit|launch|sim)_/i.test(orderId)) return false;
  if (SIMULATION_CUSTOMERS.has(String(row.customer_id || ""))) return false;
  if (row.restaurant_id === TEST_RESTAURANT_ID) return true;
  if (isTestRestaurant({ restaurant_id: row.restaurant_id })) return true;
  if (row.test_order) return true;
  return false;
}
