/**
 * Response construction for the public API.
 *
 * Every API response — success or failure — is built here, so the content type,
 * the cache policy and the format negotiation stay consistent across endpoints.
 */

import { toApiError, type ApiError } from '@/lib/api/errors';
import {
  CACHE_REGISTERED_S_MAXAGE,
  CACHE_REGISTERED_SWR,
  CACHE_UNREGISTERED_S_MAXAGE,
  CACHE_UNREGISTERED_SWR,
} from '@/lib/config';
import { contentTypeFor, serialize, type OutputFormat } from '@/lib/serialization';

export interface ApiResponseInit {
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

export function apiResponse(
  data: unknown,
  format: OutputFormat,
  init: ApiResponseInit = {},
): Response {
  return new Response(serialize(data, format), {
    status: init.status ?? 200,
    headers: {
      'content-type': contentTypeFor(format),
      vary: 'Accept',
      ...init.headers,
    },
  });
}

/** Render an error in the negotiated format. Never leaks internal detail. */
export function apiErrorResponse(
  error: unknown,
  format: OutputFormat,
  extraHeaders: Record<string, string> = {},
): Response {
  const apiError: ApiError = toApiError(error);
  return apiResponse(apiError.toBody(), format, {
    status: apiError.status,
    headers: {
      'cache-control': 'no-store',
      ...apiError.headers,
      ...extraHeaders,
    },
  });
}

/**
 * Cache policy for a lookup.
 *
 * Registration data barely moves, so successful lookups are cached hard at the
 * CDN with a long stale-while-revalidate. "Not registered" is cached far more
 * briefly: that is exactly the answer most likely to change.
 */
export function lookupCacheControl(registered: boolean): string {
  return registered
    ? `public, max-age=0, s-maxage=${CACHE_REGISTERED_S_MAXAGE}, stale-while-revalidate=${CACHE_REGISTERED_SWR}`
    : `public, max-age=0, s-maxage=${CACHE_UNREGISTERED_S_MAXAGE}, stale-while-revalidate=${CACHE_UNREGISTERED_SWR}`;
}
