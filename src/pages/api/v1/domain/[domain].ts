/**
 * `GET /api/v1/domain/:domain`
 *
 * The public TraceZone lookup endpoint. The domain always arrives as a path
 * segment — there is deliberately no endpoint that accepts an upstream URL.
 */

import type { APIRoute } from 'astro';
import { ApiError } from '@/lib/api/errors';
import { resolveFormat } from '@/lib/api/format';
import { clientKey, getRateLimiter, rateLimitHeaders } from '@/lib/api/rate-limit';
import { apiErrorResponse, apiResponse, lookupCacheControl } from '@/lib/api/response';
import { lookupDomain } from '@/lib/lookup/domain';
import { DEFAULT_FORMAT, type OutputFormat } from '@/lib/serialization';
import { decodeDomainParam } from '@/lib/validation/domain';

export const prerender = false;

function wantsRaw(url: URL): boolean {
  const raw = url.searchParams.get('raw');
  if (raw === null) return true;
  return !['0', 'false', 'no'].includes(raw.trim().toLowerCase());
}

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);

  // Resolve the format before anything else so errors are rendered in the
  // format the caller asked for.
  let format: OutputFormat;
  try {
    format = resolveFormat(url, request.headers);
  } catch (error) {
    return apiErrorResponse(error, DEFAULT_FORMAT);
  }

  const limiter = getRateLimiter();
  const limit = await limiter.check(clientKey(request));
  const limitHeaders = rateLimitHeaders(limit);

  if (!limit.allowed) {
    return apiErrorResponse(
      new ApiError('RATE_LIMITED', undefined, {
        'retry-after': String(limit.retryAfterSeconds),
      }),
      format,
      limitHeaders,
    );
  }

  try {
    const result = await lookupDomain(decodeDomainParam(params.domain ?? ''), {
      includeRaw: wantsRaw(url),
    });
    return apiResponse(result, format, {
      headers: {
        'cache-control': lookupCacheControl(result.registered),
        ...limitHeaders,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, format, limitHeaders);
  }
};

/** Anything other than GET is rejected in the negotiated format. */
export const ALL: APIRoute = ({ request }) => {
  const format = (() => {
    try {
      return resolveFormat(new URL(request.url), request.headers);
    } catch {
      return DEFAULT_FORMAT;
    }
  })();
  return apiErrorResponse(new ApiError('METHOD_NOT_ALLOWED', undefined, { allow: 'GET' }), format);
};
