/**
 * `GET /api/health`
 *
 * Liveness probe for uptime monitoring. Intentionally does no upstream work:
 * it answers whether this deployment is serving, not whether RDAP is healthy.
 */

import type { APIRoute } from 'astro';
import { resolveFormat } from '@/lib/api/format';
import { apiErrorResponse, apiResponse } from '@/lib/api/response';
import { DEFAULT_FORMAT, type OutputFormat } from '@/lib/serialization';

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  let format: OutputFormat;
  try {
    format = resolveFormat(new URL(request.url), request.headers);
  } catch (error) {
    return apiErrorResponse(error, DEFAULT_FORMAT);
  }

  return apiResponse({ status: 'ok' }, format, {
    headers: { 'cache-control': 'no-store' },
  });
};
