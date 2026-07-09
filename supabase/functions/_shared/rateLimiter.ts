type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const blockedLog: Array<{ key: string; path: string; at: string }> = [];
const MAX_BLOCKED_LOG = 200;

export interface RateLimitRule {
  pattern: RegExp;
  methods?: string[];
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_RULES: RateLimitRule[] = [
  { pattern: /^\/auth\//, limit: 30, windowMs: 60_000 },
  { pattern: /^\/orders/, methods: ["POST"], limit: 20, windowMs: 60_000 },
  { pattern: /\/checkout/, methods: ["POST"], limit: 15, windowMs: 60_000 },
  { pattern: /^\/wallet\//, methods: ["POST"], limit: 10, windowMs: 60_000 },
  { pattern: /^\/vendor\//, limit: 60, windowMs: 60_000 },
  { pattern: /^\/driver\//, limit: 120, windowMs: 60_000 },
  { pattern: /^\/delivery\//, limit: 120, windowMs: 60_000 },
];

function pruneBucket(key: string, now: number) {
  const b = buckets.get(key);
  if (b && b.resetAt <= now) buckets.delete(key);
}

export function checkRateLimit(
  clientKey: string,
  path: string,
  method: string
): { allowed: boolean; rule?: RateLimitRule; retryAfterSec?: number } {
  const now = Date.now();
  pruneBucket(clientKey, now);

  for (const rule of RATE_LIMIT_RULES) {
    if (!rule.pattern.test(path)) continue;
    if (rule.methods && !rule.methods.includes(method)) continue;

    const key = `${clientKey}:${rule.pattern.source}:${method}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + rule.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > rule.limit) {
      blockedLog.unshift({ key: clientKey, path, at: new Date().toISOString() });
      if (blockedLog.length > MAX_BLOCKED_LOG) blockedLog.pop();
      return {
        allowed: false,
        rule,
        retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
      };
    }
    return { allowed: true, rule };
  }

  return { allowed: true };
}

export function getRateLimitMetrics() {
  const activeBuckets = buckets.size;
  const recentBlocked = blockedLog.slice(0, 50);
  const blockedByPath: Record<string, number> = {};
  for (const entry of blockedLog) {
    blockedByPath[entry.path] = (blockedByPath[entry.path] || 0) + 1;
  }
  return {
    active_buckets: activeBuckets,
    total_blocked: blockedLog.length,
    recent_blocked: recentBlocked,
    blocked_by_path: blockedByPath,
  };
}
