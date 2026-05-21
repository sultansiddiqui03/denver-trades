import { NextResponse } from 'next/server';

/**
 * Sliding-window rate limiter.
 *
 * Backed by an in-process LRU Map for now. On Vercel Fluid Compute, function
 * instances are reused across concurrent requests so this gives correct
 * per-instance counts at the cost of being non-distributed (two instances
 * processing the same org's traffic see independent windows).
 *
 * To upgrade to true distributed limits later:
 *   1. Install `@upstash/redis` (or use Vercel KV).
 *   2. Replace `memoryStore` with a Redis-backed `ZADD`/`ZRANGEBYSCORE` impl.
 *
 * The interface and callers stay identical.
 */

type Bucket = number[]; // unix-ms timestamps of recent hits

const MAX_BUCKETS = 5000;
const memoryStore = new Map<string, Bucket>();

function trim(bucket: Bucket, windowStart: number): Bucket {
  // Sorted oldest → newest. Drop everything older than the window.
  let i = 0;
  while (i < bucket.length && bucket[i] < windowStart) i++;
  return i === 0 ? bucket : bucket.slice(i);
}

function lruEvictIfNeeded() {
  if (memoryStore.size <= MAX_BUCKETS) return;
  // Drop the first ~10% of entries (insertion-ordered Maps).
  const dropCount = Math.ceil(MAX_BUCKETS * 0.1);
  let dropped = 0;
  for (const key of memoryStore.keys()) {
    memoryStore.delete(key);
    if (++dropped >= dropCount) break;
  }
}

export interface RateLimitOptions {
  /** Logical identifier — typically `${orgId}:${routeName}`. */
  key: string;
  /** Allowed requests within the window. */
  max: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  total: number;
}

export function rateLimit({ key, max, windowSec }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  const existing = memoryStore.get(key) ?? [];
  const trimmed = trim(existing, windowStart);

  if (trimmed.length >= max) {
    // Don't record this hit. Retry-after = until the oldest hit ages out.
    const oldest = trimmed[0];
    const retryMs = oldest + windowSec * 1000 - now;
    memoryStore.set(key, trimmed);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)),
      total: max,
    };
  }

  trimmed.push(now);
  memoryStore.set(key, trimmed);
  lruEvictIfNeeded();

  return {
    allowed: true,
    remaining: max - trimmed.length,
    retryAfterSec: 0,
    total: max,
  };
}

/**
 * Convenience wrapper for API routes: applies the limit and, if blocked,
 * returns a 429 response with the standard headers. Returns `null` when
 * the request is allowed (caller proceeds).
 */
export function rateLimitOrThrow(opts: RateLimitOptions): NextResponse | null {
  const result = rateLimit(opts);
  if (result.allowed) return null;

  return NextResponse.json(
    {
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Limit': String(result.total),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}
