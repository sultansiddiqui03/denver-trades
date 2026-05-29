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

function tooManyRequests(result: RateLimitResult): NextResponse {
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

/**
 * Convenience wrapper for API routes: applies the (in-process) limit and, if
 * blocked, returns a 429. Returns `null` when allowed. Synchronous — use for
 * high-volume / latency-sensitive routes where a per-instance window is fine.
 */
export function rateLimitOrThrow(opts: RateLimitOptions): NextResponse | null {
  const result = rateLimit(opts);
  return result.allowed ? null : tooManyRequests(result);
}

/* -------------------------------------------------------------------------- */
/* Distributed (KV-backed) limiter                                            */
/* -------------------------------------------------------------------------- */

function kvCreds(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

/**
 * Fixed-window distributed limit via Upstash/Vercel-KV REST (INCR + EXPIRE).
 * Returns null to signal "no KV configured / KV failed" so the caller falls
 * back to the in-process limiter. Activates automatically the moment a KV store
 * is provisioned (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN) — no
 * code change needed then.
 */
async function kvRateLimit(opts: RateLimitOptions): Promise<RateLimitResult | null> {
  const creds = kvCreds();
  if (!creds) return null;
  const headers = { Authorization: `Bearer ${creds.token}` };
  const k = `rl:${opts.key}`;
  try {
    const incrRes = await fetch(`${creds.url}/incr/${encodeURIComponent(k)}`, {
      headers,
      cache: 'no-store',
    });
    if (!incrRes.ok) return null;
    const count = Number((await incrRes.json())?.result ?? 0);
    if (!Number.isFinite(count) || count <= 0) return null;

    if (count === 1) {
      // First hit in this window — set the TTL.
      await fetch(`${creds.url}/expire/${encodeURIComponent(k)}/${opts.windowSec}`, {
        headers,
        cache: 'no-store',
      });
    }

    if (count > opts.max) {
      let retry = opts.windowSec;
      try {
        const ttlRes = await fetch(`${creds.url}/ttl/${encodeURIComponent(k)}`, {
          headers,
          cache: 'no-store',
        });
        const ttl = Number((await ttlRes.json())?.result ?? opts.windowSec);
        if (ttl > 0) retry = ttl;
      } catch {
        /* keep window default */
      }
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retry), total: opts.max };
    }
    return {
      allowed: true,
      remaining: Math.max(0, opts.max - count),
      retryAfterSec: 0,
      total: opts.max,
    };
  } catch (e) {
    console.error('kvRateLimit failed — falling back to in-process:', e);
    return null;
  }
}

/**
 * Async limiter for expensive routes (AI generation, enrichment, doc audit):
 * uses the distributed KV window when a KV store is configured, otherwise the
 * in-process window. Returns a 429 when blocked, else null.
 */
export async function rateLimitOrThrowAsync(opts: RateLimitOptions): Promise<NextResponse | null> {
  const result = (await kvRateLimit(opts)) ?? rateLimit(opts);
  return result.allowed ? null : tooManyRequests(result);
}
