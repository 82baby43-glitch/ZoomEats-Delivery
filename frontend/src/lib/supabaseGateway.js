/**
 * Supabase optimization gateway.
 * Reuses authenticated session, tracks subscriptions, and prevents duplicate channels.
 * Existing useRealtime.js behavior is preserved — this layer is additive.
 */

import { supabase as baseSupabase } from "./supabaseClient";
import { normalizeSupabaseError } from "./api/errors";
import { API_CONFIG } from "./api/config";

// Session cache — avoid unnecessary auth refreshes
let cachedSession = null;
let sessionFetchedAt = 0;
const SESSION_CACHE_MS = 60000;

// Active subscription registry — prevent duplicate channels
const activeChannels = new Map(); // channelKey -> { channel, refCount }

// Profile / settings read cache (short TTL)
const profileCache = new Map();

function log(...args) {
  if (API_CONFIG.verboseLogging) console.debug("[supabaseGateway]", ...args);
}

export const supabase = baseSupabase;

/**
 * Get cached session or fetch fresh — reduces redundant auth calls.
 */
export async function getSession({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedSession && Date.now() - sessionFetchedAt < SESSION_CACHE_MS) {
    log("session cache hit");
    return cachedSession;
  }

  const { data, error } = await baseSupabase.auth.getSession();
  if (error) throw normalizeSupabaseError(error);

  cachedSession = data.session;
  sessionFetchedAt = Date.now();
  return cachedSession;
}

export function clearSessionCache() {
  cachedSession = null;
  sessionFetchedAt = 0;
}

/**
 * Cache profile reads with configurable TTL.
 */
export function getCachedProfile(userId) {
  const entry = profileCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    profileCache.delete(userId);
    return null;
  }
  return entry.data;
}

export function setCachedProfile(userId, data, ttlMs = 60000) {
  profileCache.set(userId, { ts: Date.now(), ttl: ttlMs, data });
}

export function invalidateProfileCache(userId) {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();
}

/**
 * Managed realtime subscription — deduplicates identical channels and cleans up unused ones.
 */
export function subscribeToRow({ table, column, value, onChange, channelName }) {
  if (!baseSupabase || !value) return () => {};

  const key = channelName || `${table}:${column}:${value}`;
  let entry = activeChannels.get(key);

  if (entry) {
    entry.refCount += 1;
    entry.listeners.add(onChange);
    log("subscription reused", key, "refs=", entry.refCount);
  } else {
    const listeners = new Set([onChange]);
    const channel = baseSupabase
      .channel(`gw-${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${column}=eq.${value}` },
        (payload) => {
          listeners.forEach((fn) => {
            try {
              fn(payload);
            } catch (e) {
              console.warn("[supabaseGateway] listener error", e);
            }
          });
        }
      )
      .subscribe((status, err) => {
        if (err && API_CONFIG.isDevelopment) {
          console.debug(`[supabaseGateway] ${key} status=${status}`);
        }
      });

    entry = { channel, refCount: 1, listeners };
    activeChannels.set(key, entry);
    log("subscription created", key);
  }

  return () => {
    const current = activeChannels.get(key);
    if (!current) return;

    current.listeners.delete(onChange);
    current.refCount -= 1;

    if (current.refCount <= 0 || current.listeners.size === 0) {
      baseSupabase.removeChannel(current.channel);
      activeChannels.delete(key);
      log("subscription removed", key);
    }
  };
}

/**
 * Remove all managed subscriptions — useful on logout.
 */
export function cleanupAllSubscriptions() {
  for (const [, entry] of activeChannels) {
    baseSupabase.removeChannel(entry.channel);
  }
  activeChannels.clear();
  log("all subscriptions cleaned up");
}

export function getSubscriptionSnapshot() {
  return Array.from(activeChannels.entries()).map(([key, entry]) => ({
    key,
    refCount: entry.refCount,
    listeners: entry.listeners.size,
  }));
}

export default {
  supabase,
  getSession,
  clearSessionCache,
  getCachedProfile,
  setCachedProfile,
  invalidateProfileCache,
  subscribeToRow,
  cleanupAllSubscriptions,
  getSubscriptionSnapshot,
};
