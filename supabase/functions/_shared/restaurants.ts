/** Test/sandbox restaurants — hidden from public marketplace listings. */

import { isTestRestaurant, type TestRestaurantLike } from "./orders/isTestOrder.ts";

export function isTestRestaurantName(name: string | null | undefined): boolean {
  return /^TEST_/i.test(String(name || "").trim());
}

export function isSandboxRestaurant(row: TestRestaurantLike | null | undefined): boolean {
  return isTestRestaurant(row) || isTestRestaurantName(row?.name);
}

export function filterPublicRestaurants<T extends TestRestaurantLike>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter((row) => !isSandboxRestaurant(row));
}
