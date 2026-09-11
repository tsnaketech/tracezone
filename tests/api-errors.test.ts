import { describe, expect, it } from 'vitest';
import { decode } from '@toon-format/toon';
import { API_ERROR_CODES, ApiError, ERROR_STATUS, toApiError } from '@/lib/api/errors';
import { apiErrorResponse, apiResponse, lookupCacheControl } from '@/lib/api/response';
import { MemoryRateLimiter, clientKey, rateLimitHeaders } from '@/lib/api/rate-limit';

describe('ApiError', () => {
  it('carries the HTTP status of its code', () => {
    expect(new ApiError('INVALID_DOMAIN').status).toBe(400);
    expect(new ApiError('DOMAIN_NOT_FOUND').status).toBe(404);
    expect(new ApiError('RATE_LIMITED').status).toBe(429);
    expect(new ApiError('RDAP_ERROR').status).toBe(502);
    expect(new ApiError('UPSTREAM_TIMEOUT').status).toBe(504);
    expect(new ApiError('INTERNAL_ERROR').status).toBe(500);
  });

  it('defines a status and a default message for every code', () => {
    for (const code of API_ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(new ApiError(code).message.length).toBeGreaterThan(0);
    }
  });

  it('serialises to the documented envelope', () => {
    expect(new ApiError('INVALID_DOMAIN').toBody()).toEqual({
      error: { code: 'INVALID_DOMAIN', message: 'The supplied domain name is invalid.' },
    });
  });
});

describe('toApiError', () => {
  it('passes an ApiError through unchanged', () => {
    const original = new ApiError('RDAP_ERROR', 'registry said no');
    expect(toApiError(original)).toBe(original);
  });

  it('collapses an unexpected throwable to a generic internal error', () => {
    const converted = toApiError(
      new Error('connect ECONNREFUSED 10.0.0.1:443 at /srv/app/x.js:12'),
    );
    expect(converted.code).toBe('INTERNAL_ERROR');
    expect(converted.status).toBe(500);
    expect(converted.message).toBe('An unexpected error occurred.');
    expect(converted.message).not.toContain('10.0.0.1');
  });

  it('handles a non-Error throwable', () => {
    expect(toApiError('boom').code).toBe('INTERNAL_ERROR');
    expect(toApiError(undefined).code).toBe('INTERNAL_ERROR');
  });
});

describe('apiResponse', () => {
  it('sets the content type and Vary for JSON', async () => {
    const response = apiResponse({ status: 'ok' }, 'json');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(JSON.parse(await response.text())).toEqual({ status: 'ok' });
  });

  it('renders the same data as TOON', async () => {
    const response = apiResponse({ status: 'ok' }, 'toon');
    expect(response.headers.get('content-type')).toContain('text/toon');
    expect(decode(await response.text())).toEqual({ status: 'ok' });
  });
});

describe('apiErrorResponse', () => {
  it('renders the error in the negotiated format and never caches it', async () => {
    const response = apiErrorResponse(new ApiError('INVALID_DOMAIN'), 'toon');
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(decode(await response.text())).toEqual({
      error: { code: 'INVALID_DOMAIN', message: 'The supplied domain name is invalid.' },
    });
  });

  it('forwards the headers attached to the error', () => {
    const response = apiErrorResponse(
      new ApiError('RATE_LIMITED', undefined, { 'retry-after': '30' }),
      'json',
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
  });
});

describe('lookupCacheControl', () => {
  it('caches a registered answer far longer than an unregistered one', () => {
    expect(lookupCacheControl(true)).toContain('s-maxage=3600');
    expect(lookupCacheControl(false)).toContain('s-maxage=300');
    expect(lookupCacheControl(true)).toContain('stale-while-revalidate');
  });
});

describe('MemoryRateLimiter', () => {
  it('allows up to the limit and then rejects', async () => {
    const limiter = new MemoryRateLimiter(3, 60_000);

    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.check('a')).allowed).toBe(true);
    }

    const rejected = await limiter.check('a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each key independently', async () => {
    const limiter = new MemoryRateLimiter(1, 60_000);
    expect((await limiter.check('a')).allowed).toBe(true);
    expect((await limiter.check('b')).allowed).toBe(true);
    expect((await limiter.check('a')).allowed).toBe(false);
  });

  it('starts a fresh window once the previous one expires', async () => {
    const limiter = new MemoryRateLimiter(1, 1);
    expect((await limiter.check('a')).allowed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await limiter.check('a')).allowed).toBe(true);
  });
});

describe('clientKey', () => {
  it('uses the left-most forwarded address', () => {
    const request = new Request('https://tracezone.test/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' },
    });
    expect(clientKey(request)).toBe('203.0.113.7');
  });

  it('falls back to a constant when the address is unknown', () => {
    expect(clientKey(new Request('https://tracezone.test/'))).toBe('unknown');
  });
});

describe('rateLimitHeaders', () => {
  it('emits the standard headers', () => {
    const headers = rateLimitHeaders({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: 1_700_000_000_000,
      retryAfterSeconds: 0,
    });
    expect(headers['x-ratelimit-limit']).toBe('60');
    expect(headers['x-ratelimit-remaining']).toBe('59');
    expect(headers['x-ratelimit-reset']).toBe('1700000000');
  });

  it('emits nothing when rate limiting is disabled', () => {
    expect(
      rateLimitHeaders({
        allowed: true,
        limit: Number.POSITIVE_INFINITY,
        remaining: Number.POSITIVE_INFINITY,
        resetAt: 0,
        retryAfterSeconds: 0,
      }),
    ).toEqual({});
  });
});
