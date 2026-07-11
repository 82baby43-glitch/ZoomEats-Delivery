/** Remove customer-only delivery verification fields from API responses. */
export function stripSensitiveOrderFields<T extends Record<string, unknown>>(order: T): T {
  if (!order || typeof order !== "object") return order;
  const { delivery_verification_code, delivery_verification_code_hash, ...safe } = order;
  return safe as T;
}

export function stripSensitiveOrders<T extends Record<string, unknown>>(orders: T[]): T[] {
  return (orders || []).map(stripSensitiveOrderFields);
}
