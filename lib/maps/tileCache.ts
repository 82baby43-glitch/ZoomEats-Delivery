const CACHE_NAME = "zoomeats-map-tiles-v1";
const MAX_ENTRIES = 800;
const entryOrder: string[] = [];

function touchKey(url: string) {
  const idx = entryOrder.indexOf(url);
  if (idx >= 0) entryOrder.splice(idx, 1);
  entryOrder.push(url);
  while (entryOrder.length > MAX_ENTRIES) {
    const evict = entryOrder.shift();
    if (evict && typeof caches !== "undefined") {
      caches.open(CACHE_NAME).then((c) => c.delete(evict)).catch(() => {});
    }
  }
}

export async function fetchTileWithCache(url: string): Promise<string> {
  if (typeof window === "undefined" || typeof caches === "undefined") return url;

  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      touchKey(url);
      const blob = await hit.blob();
      return URL.createObjectURL(blob);
    }

    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      await cache.put(url, res.clone());
      touchKey(url);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    /* fall through to network URL */
  }

  return url;
}

export function revokeTileObjectUrl(objectUrl: string) {
  if (objectUrl?.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }
}

export async function prefetchTile(url: string) {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (res.ok) {
        await cache.put(url, res);
        touchKey(url);
      }
    }
  } catch {
    /* ignore prefetch failures */
  }
}
