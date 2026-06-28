/**
 * Priority-aware request scheduler.
 * High-priority requests (checkout, auth, payments) are never blocked by low-priority work.
 */

import { REQUEST_PRIORITY } from "./config";

const queue = [];
let activeCount = 0;
const MAX_CONCURRENT_LOW = 4;
const MAX_CONCURRENT_MEDIUM = 8;
const MAX_CONCURRENT_HIGH = 12;

function maxConcurrentForPriority(priority) {
  if (priority >= REQUEST_PRIORITY.HIGH) return MAX_CONCURRENT_HIGH;
  if (priority >= REQUEST_PRIORITY.MEDIUM) return MAX_CONCURRENT_MEDIUM;
  return MAX_CONCURRENT_LOW;
}

function countActiveAtOrAbove(minPriority) {
  return queue.filter((item) => item.started && item.priority >= minPriority).length;
}

function pump() {
  const pending = queue.filter((item) => !item.started);
  if (!pending.length) return;

  pending.sort((a, b) => b.priority - a.priority);

  for (const item of pending) {
    const activeSameTier = countActiveAtOrAbove(item.priority);
    if (activeSameTier >= maxConcurrentForPriority(item.priority)) continue;

    // Low-priority work waits if any high-priority request is queued ahead
    if (item.priority < REQUEST_PRIORITY.HIGH) {
      const highQueued = queue.some((q) => !q.started && q.priority >= REQUEST_PRIORITY.HIGH);
      const highActive = countActiveAtOrAbove(REQUEST_PRIORITY.HIGH) > 0;
      if (highQueued || highActive) continue;
    }

    item.started = true;
    activeCount += 1;
    item
      .run()
      .then(item.resolve, item.reject)
      .finally(() => {
        activeCount -= 1;
        const idx = queue.indexOf(item);
        if (idx >= 0) queue.splice(idx, 1);
        pump();
      });
    break;
  }
}

export function scheduleRequest(priority, run) {
  return new Promise((resolve, reject) => {
    queue.push({ priority, run, resolve, reject, started: false });
    pump();
  });
}

export function getQueueSnapshot() {
  return {
    activeCount,
    queued: queue.filter((q) => !q.started).length,
    items: queue.map((q) => ({ priority: q.priority, started: q.started })),
  };
}
