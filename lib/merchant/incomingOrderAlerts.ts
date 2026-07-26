import { isPaymentConfirmed } from "../orderState";

export type MerchantAlertTone = "chime" | "beep";

export type MerchantAlertSettings = {
  soundEnabled: boolean;
  volume: number;
  repeatIntervalSec: number;
  tone: MerchantAlertTone;
};

export const DEFAULT_MERCHANT_ALERT_SETTINGS: MerchantAlertSettings = {
  soundEnabled: true,
  volume: 0.8,
  repeatIntervalSec: 20,
  tone: "chime",
};

const SETTINGS_KEY = "zoomeats_merchant_alert_settings";
const OFFLINE_QUEUE_KEY = "zoomeats_merchant_offline_alert_queue";
const ACCEPT_WINDOW_MIN = 20;

export function getMerchantAlertScope(merchantId: string, sandbox: boolean) {
  return `${sandbox ? "sandbox" : "production"}:${merchantId || "unknown"}`;
}

function settingsStorageKey(scope: string) {
  return `${SETTINGS_KEY}:${scope}`;
}

function offlineQueueKey(scope: string) {
  return `${OFFLINE_QUEUE_KEY}:${scope}`;
}

export function loadMerchantAlertSettings(scope: string): MerchantAlertSettings {
  if (typeof window === "undefined") return { ...DEFAULT_MERCHANT_ALERT_SETTINGS };
  try {
    const raw = localStorage.getItem(settingsStorageKey(scope));
    if (!raw) return { ...DEFAULT_MERCHANT_ALERT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<MerchantAlertSettings>;
    return {
      soundEnabled: parsed.soundEnabled !== false,
      volume: Math.min(1, Math.max(0, Number(parsed.volume ?? 0.8))),
      repeatIntervalSec: Math.min(30, Math.max(15, Number(parsed.repeatIntervalSec ?? 20))),
      tone: parsed.tone === "beep" ? "beep" : "chime",
    };
  } catch {
    return { ...DEFAULT_MERCHANT_ALERT_SETTINGS };
  }
}

export function saveMerchantAlertSettings(scope: string, patch: Partial<MerchantAlertSettings>) {
  if (typeof window === "undefined") return loadMerchantAlertSettings(scope);
  const current = loadMerchantAlertSettings(scope);
  const next = {
    ...current,
    ...patch,
    volume: patch.volume != null ? Math.min(1, Math.max(0, patch.volume)) : current.volume,
    repeatIntervalSec: patch.repeatIntervalSec != null
      ? Math.min(30, Math.max(15, patch.repeatIntervalSec))
      : current.repeatIntervalSec,
  };
  localStorage.setItem(settingsStorageKey(scope), JSON.stringify(next));
  return next;
}

export function isIncomingUnacknowledged(order: { status?: string; payment_status?: unknown } | null | undefined) {
  return String(order?.status) === "placed" && isPaymentConfirmed(order);
}

export function acceptMinutesRemaining(
  order: { created_at?: string },
  prepMinutes = ACCEPT_WINDOW_MIN
) {
  if (!order?.created_at) return prepMinutes;
  const elapsed = (Date.now() - new Date(order.created_at).getTime()) / 60000;
  return Math.max(0, Math.ceil(prepMinutes - elapsed));
}

export function sortIncomingOrders<T extends { status?: string; payment_status?: unknown; created_at?: string }>(
  orders: T[]
): T[] {
  return [...orders].sort((a, b) => {
    const aNew = isIncomingUnacknowledged(a);
    const bNew = isIncomingUnacknowledged(b);
    if (aNew !== bNew) return aNew ? -1 : 1;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

export function formatOrderNumber(orderId: string) {
  return String(orderId).slice(-4).toUpperCase();
}

export function merchantCategoryLabel(slug?: string | null) {
  const labels: Record<string, string> = {
    restaurants: "Restaurant",
    convenience_stores: "Convenience Store",
    local_retail: "Local Retail",
    grocery_stores: "Grocery Store",
    pharmacies: "Pharmacy",
    licensed_dispensary: "Dispensary",
  };
  return labels[String(slug || "restaurants")] || "Merchant";
}

export function queueOfflineAlert(scope: string, orderId: string) {
  if (typeof window === "undefined") return;
  try {
    const key = offlineQueueKey(scope);
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    if (!existing.includes(orderId)) {
      existing.push(orderId);
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch {
    /* ignore */
  }
}

export function drainOfflineAlertQueue(scope: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const key = offlineQueueKey(scope);
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    localStorage.removeItem(key);
    return existing;
  } catch {
    return [];
  }
}

export function buildIncomingOrderAlertMessage(order: {
  order_id?: string;
  delivery_type?: string;
  created_at?: string;
}, prepMinutes?: number) {
  const mins = acceptMinutesRemaining(order, prepMinutes ?? ACCEPT_WINDOW_MIN);
  const isPickup = String(order.delivery_type || "").toLowerCase() === "pickup";
  const etaLine = isPickup ? `Ready in ~${mins} minutes` : `Accept within ${mins} minutes`;
  return {
    title: "New Order Received",
    subtitle: `Order #${formatOrderNumber(String(order.order_id || ""))}`,
    etaLine,
    orderId: String(order.order_id || ""),
  };
}
