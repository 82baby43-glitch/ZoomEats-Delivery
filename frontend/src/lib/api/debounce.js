/**
 * Debounce and throttle utilities for rate-limit protection.
 */

const debounceTimers = new Map();
const throttleLastRun = new Map();
const debounceControllers = new Map();

export function debounceRequest(key, fn, delayMs) {
  // Cancel any previous in-flight request for this debounce group
  const prev = debounceControllers.get(key);
  if (prev) prev.abort();

  return new Promise((resolve, reject) => {
    if (debounceTimers.has(key)) {
      clearTimeout(debounceTimers.get(key).timer);
    }

    const controller = new AbortController();
    debounceControllers.set(key, controller);

    const entry = {
      timer: setTimeout(async () => {
        debounceTimers.delete(key);
        try {
          const result = await fn(controller.signal);
          debounceControllers.delete(key);
          resolve(result);
        } catch (err) {
          debounceControllers.delete(key);
          reject(err);
        }
      }, delayMs),
      resolve,
      reject,
    };

    debounceTimers.set(key, entry);
  });
}

export function throttleRequest(key, fn, intervalMs) {
  const now = Date.now();
  const last = throttleLastRun.get(key) || 0;
  if (now - last < intervalMs) {
    return Promise.reject(Object.assign(new Error("throttled"), { code: "THROTTLED" }));
  }
  throttleLastRun.set(key, now);
  return fn();
}

export function cancelDebounced(key) {
  const entry = debounceTimers.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    debounceTimers.delete(key);
  }
  const ctrl = debounceControllers.get(key);
  if (ctrl) {
    ctrl.abort();
    debounceControllers.delete(key);
  }
}

export function clearDebounceState() {
  for (const [, entry] of debounceTimers) clearTimeout(entry.timer);
  debounceTimers.clear();
  for (const [, ctrl] of debounceControllers) ctrl.abort();
  debounceControllers.clear();
  throttleLastRun.clear();
}
