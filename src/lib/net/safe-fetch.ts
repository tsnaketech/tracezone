/**
 * A deliberately restrictive HTTP client for talking to upstream registries.
 *
 * TraceZone never forwards a URL supplied by a user. Every request goes through
 * this module, which enforces the invariants that make that guarantee hold even
 * if an upstream tries to redirect us somewhere interesting:
 *
 *   - HTTPS only, on the default port;
 *   - no credentials in the URL;
 *   - no IP literals, loopback, link-local or reserved hostnames (SSRF);
 *   - redirects followed manually, re-validated at every hop, and bounded;
 *   - a wall-clock timeout;
 *   - a hard cap on the number of bytes buffered from the response.
 */

import { MAX_REDIRECTS, MAX_UPSTREAM_BYTES } from '@/lib/config';

export type SafeFetchFailureKind =
  'blocked' | 'timeout' | 'network' | 'too_large' | 'too_many_redirects';

export class SafeFetchError extends Error {
  readonly kind: SafeFetchFailureKind;

  constructor(kind: SafeFetchFailureKind, message: string) {
    super(message);
    this.name = 'SafeFetchError';
    this.kind = kind;
  }
}

export interface SafeFetchOptions {
  readonly timeoutMs: number;
  readonly headers?: Record<string, string>;
  readonly maxBytes?: number;
}

export interface SafeFetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly url: string;
  readonly contentType: string | null;
  readonly body: string;
}

/** Hostnames that must never be reached, whatever the upstream claims. */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.onion'];
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Reject anything that is not a plain, public, HTTPS hostname.
 *
 * IP literals are refused outright: RDAP registries are always published under
 * a DNS name, so allowing literals would only ever widen the SSRF surface.
 */
export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError('blocked', 'Upstream URL is not a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new SafeFetchError('blocked', 'Only HTTPS upstream endpoints are allowed.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new SafeFetchError('blocked', 'Upstream URLs must not carry credentials.');
  }
  if (url.port !== '' && url.port !== '443') {
    throw new SafeFetchError('blocked', 'Only the default HTTPS port is allowed.');
  }

  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || IPV4_PATTERN.test(host)) {
    throw new SafeFetchError('blocked', 'Upstream IP literals are not allowed.');
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new SafeFetchError(
      'blocked',
      'Upstream hostname is not routable on the public internet.',
    );
  }
  if (!host.includes('.')) {
    throw new SafeFetchError('blocked', 'Upstream hostname must be fully qualified.');
  }

  return url;
}

/** Read a response body, aborting as soon as it grows past `maxBytes`. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    throw new SafeFetchError('too_large', 'Upstream response exceeds the allowed size.');
  }

  const body = response.body;
  if (body === null) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new SafeFetchError('too_large', 'Upstream response exceeds the allowed size.');
      }
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

/**
 * Perform a GET request under the constraints documented above.
 *
 * Redirects are handled here rather than by `fetch` so that every hop is
 * re-validated by {@link assertSafeUrl}.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResponse> {
  const maxBytes = options.maxBytes ?? MAX_UPSTREAM_BYTES;
  const deadline = Date.now() + options.timeoutMs;
  let current = assertSafeUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SafeFetchError('timeout', 'Upstream request timed out.');
    }

    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: options.headers ?? {},
        signal: AbortSignal.timeout(remaining),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new SafeFetchError('timeout', 'Upstream request timed out.');
      }
      throw new SafeFetchError('network', 'Upstream request failed.');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      response.body?.cancel().catch(() => undefined);
      if (location === null) {
        throw new SafeFetchError('network', 'Upstream sent a redirect without a target.');
      }
      if (hop === MAX_REDIRECTS) {
        throw new SafeFetchError('too_many_redirects', 'Upstream redirected too many times.');
      }
      current = assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    return {
      status: response.status,
      ok: response.ok,
      url: current.toString(),
      contentType: response.headers.get('content-type'),
      body: await readCapped(response, maxBytes),
    };
  }

  throw new SafeFetchError('too_many_redirects', 'Upstream redirected too many times.');
}
