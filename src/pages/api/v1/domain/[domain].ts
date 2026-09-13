/**
 * `GET /api/v1/domain/:domain`
 *
 * The public TraceZone lookup endpoint. The domain always arrives as a path
 * segment — there is deliberately no endpoint that accepts an upstream URL.
 */

import type { APIRoute } from 'astro';
import { ApiError } from '@/lib/api/errors';
import { resolveFormat } from '@/lib/api/format';
import { parseBooleanParam } from '@/lib/api/params';
import { clientKey, getRateLimiter } from '@/lib/api/rate-limit';
import {
  apiErrorResponse,
  apiResponse,
  corsPreflightResponse,
  lookupCacheControl,
} from '@/lib/api/response';
import { lookupDomain } from '@/lib/lookup/domain';
import { DEFAULT_FORMAT, type OutputFormat } from '@/lib/serialization';
import { decodeDomainParam } from '@/lib/validation/domain';

export const prerender = false;

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

  // No X-RateLimit-* headers: the limiter is per serverless instance and edge
  // hits never reach it, so an advertised budget would be fiction. See
  // `@/lib/api/rate-limit` for what it takes to make it real.
  const limit = await getRateLimiter().check(clientKey(request));
  if (!limit.allowed) {
    return apiErrorResponse(
      new ApiError('RATE_LIMITED', undefined, {
        'retry-after': String(limit.retryAfterSeconds),
      }),
      format,
    );
  }

  try {
    const result = await lookupDomain(decodeDomainParam(params.domain ?? ''), {
      includeRaw: parseBooleanParam(url, 'raw', true),
    });
    return apiResponse(result, format, {
      headers: { 'cache-control': lookupCacheControl(result.registered) },
    });
  } catch (error) {
    return apiErrorResponse(error, format);
  }
};

/** CORS preflight, so browser clients on other origins can call the API. */
export const OPTIONS: APIRoute = () => corsPreflightResponse();

/** Anything other than GET is rejected in the negotiated format. */
export const ALL: APIRoute = ({ request }) => {
  const format = (() => {
    try {
      return resolveFormat(new URL(request.url), request.headers);
    } catch {
      return DEFAULT_FORMAT;
    }
  })();
  return apiErrorResponse(
    new ApiError('METHOD_NOT_ALLOWED', undefined, { allow: 'GET, OPTIONS' }),
    format,
  );
};
