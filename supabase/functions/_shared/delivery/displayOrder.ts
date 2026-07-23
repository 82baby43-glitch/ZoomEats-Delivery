/** Short order # for counter handoff (Option A — show, don't type). */
export function formatDisplayOrderNumber(orderId: string | null | undefined): string {
  const raw = String(orderId || "").replace(/^ord_?/i, "");
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!compact) return "----";
  return compact.length <= 4 ? compact.padStart(4, "0") : compact.slice(-4);
}

export function customerFirstName(customerName: string | null | undefined): string {
  const name = String(customerName || "").trim();
  if (!name) return "Customer";
  return name.split(/\s+/)[0] || "Customer";
}

export function pickupVerbalScript(orderId: string, customerName: string | null | undefined): string {
  const num = formatDisplayOrderNumber(orderId);
  const first = customerFirstName(customerName);
  return `Pickup for ${first}, order ${num}`;
}
