/** Test/sandbox restaurants — hidden from public marketplace listings. */

export function isTestRestaurantName(name: string | null | undefined): boolean {
  return /^TEST_/i.test(String(name || "").trim());
}

export function filterPublicRestaurants<T extends { name?: string | null }>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter((row) => !isTestRestaurantName(row.name));
}
