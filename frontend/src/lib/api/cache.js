/**
 * Global in-memory cache with optional persistent layer, versioning, and SWR support.
 */

import { API_CONFIG } from "./config";

const memoryCache = new Map(); // key -> { ts, ttl, data, version, staleAt }

function persistentKey(key) {
  return `${API_CONFIG.persistentCachePrefix}:${API_CONFIG.cacheVersion}:${key}`;
}

function readPersistent(key) {
  if (!API_CONFIG.persistentCacheEnabled) return null;
  try {
    const raw = localStorage.getItem(persistentKey(key));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writePersistent(key, entry) {
  if (!API_CONFIG.persistentCacheEnabled) return;
  try {
    localStorage.setItem(persistentKey(key), JSON.stringify(entry));
  } catch {
    // quota exceeded — ignore
  }
}

function removePersistent(key) {
  if (!API_CONFIG.persistentCacheEnabled) return;
  try {
    localStorage.removeItem(persistentKey(key));
  } catch {
    // ignore
  }
}

export function buildCacheKey(method, url, body, version = API_CONFIG.cacheVersion) {
  let serialized = "";
  try {
    serialized = body ? JSON.stringify(body) : "";
  } catch {
    serialized = String(body);
  }
  return `${version}|${method.toUpperCase()} ${url} ${serialized}`;
}

export function getCacheEntry(key) {
  const mem = memoryCache.get(key);
  if (mem) return mem;

  const persisted = readPersistent(key);
  if (persisted) {
    memoryCache.set(key, persisted);
    return persisted;
  }

  return null;
}

export function setCacheEntry(key, data, ttl) {
  const entry = {
    ts: Date.now(),
    ttl,
    data,
    version: API_CONFIG.cacheVersion,
  };
  memoryCache.set(key, entry);
  writePersistent(key, entry);
  return entry;
}

export function isFresh(entry) {
  if (!entry) return false;
  return Date.now() - entry.ts < entry.ttl;
}

export function isStaleButRevalidatable(entry) {
  if (!entry || entry.ttl <= 0) return false;
  const age = Date.now() - entry.ts;
  return age >= entry.ttl && age < entry.ttl * API_CONFIG.swrMultiplier;
}

export function invalidateCache(urlPattern) {
  const keys = Array.from(memoryCache.keys());
  for (const key of keys) {
    if (key.includes(urlPattern)) {
      memoryCache.delete(key);
      removePersistent(key);
    }
  }
}

export function invalidateCacheKeys(keys) {
  for (const key of keys) {
    memoryCache.delete(key);
    removePersistent(key);
  }
}

export function clearCache() {
  memoryCache.clear();
  if (API_CONFIG.persistentCacheEnabled) {
    try {
      const prefix = `${API_CONFIG.persistentCachePrefix}:`;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }
}

export function optimisticUpdate(key, updater) {
  const entry = getCacheEntry(key);
  if (!entry) return false;
  const nextData = typeof updater === "function" ? updater(entry.data) : updater;
  setCacheEntry(key, nextData, entry.ttl);
  return true;
}

export function getCacheSnapshot() {
  const out = {};
  for (const [k, v] of memoryCache.entries()) {
    out[k] = { ts: v.ts, ttl: v.ttl, version: v.version };
  }
  return out;
}

export function bumpCacheVersion() {
  // Consumers can set REACT_APP_API_CACHE_VERSION to invalidate all cached data on deploy.
  return API_CONFIG.cacheVersion;
}
