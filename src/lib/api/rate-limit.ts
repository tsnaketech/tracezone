/**
 * Rate limiting.
 *
 * The interface is the point of this module: routes depend on `RateLimiter`,
 * not on a backend. The MVP ships an in-memory fixed-window limiter, which on
 * Vercel is per serverless instance — it blunts a single noisy client but is
 * not a global quota.
 *
 * To make it global, implement `RateLimiter` against a shared store (Vercel KV,
 * Upstash Redis, Durable Objects...) and return it from {@link getRateLimiter}.
 * Nothing else has to change.
 */

import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '@/lib/config';

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Unix milliseconds at which the current window resets. */
  readonly resetAt: number;
  /** Seconds a rejected caller should wait. */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window counter held in process memory. */
export class MemoryRateLimiter implements RateLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(limit = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    this.#sweep(now);

    let window = this.#windows.get(key);
    if (window === undefined || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.#windowMs };
      this.#windows.set(key, window);
    }

    window.count += 1;
    const allowed = window.count <= this.#limit;

    return {
      allowed,
      limit: this.#limit,
      remaining: Math.max(this.#limit - window.count, 0),
      resetAt: window.resetAt,
      retryAfterSeconds: Math.max(Math.ceil((window.resetAt - now) / 1000), 1),
    };
  }

  /** Drop expired windows so the map cannot grow without bound. */
  #sweep(now: number): void {
    if (this.#windows.size < 1024) return;
    for (const [key, window] of this.#windows) {
      if (window.resetAt <= now) this.#windows.delete(key);
    }
  }
}

/** A limiter that never rejects — used when rate limiting is disabled. */
export class NoopRateLimiter implements RateLimiter {
  async check(): Promise<RateLimitResult> {
    return {
      allowed: true,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      resetAt: Date.now(),
      retryAfterSeconds: 0,
    };
  }
}

let limiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  limiter ??= new MemoryRateLimiter();
  return limiter;
}

/** Test seam: swap the process-wide limiter. */
export function setRateLimiter(next: RateLimiter | null): void {
  limiter = next;
}

/**
 * Derive a rate-limit key for a request.
 *
 * Only the left-most `X-Forwarded-For` entry is used, and the value is never
 * logged or persisted — it lives in memory for the length of one window.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first !== undefined && first !== '') return first;
  return request.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

/** Standard rate-limit headers for a result. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (!Number.isFinite(result.limit)) return {};
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
