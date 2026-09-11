/**
 * RDAP transport.
 *
 * This module owns every outbound RDAP request. The URL is always built here
 * from a base discovered through the IANA bootstrap registry (or the rdap.org
 * redirector) plus a single URL-encoded path segment — a caller can never make
 * TraceZone fetch an address of its choosing.
 */

import { RDAP_FALLBACK_BASE, RDAP_TIMEOUT_MS, RDAP_USER_AGENT } from '@/lib/config';
import { SafeFetchError, safeFetch } from '@/lib/net/safe-fetch';
import { getBootstrap } from '@/lib/rdap/bootstrap';
import type { RdapDomain, RdapErrorResponse } from '@/lib/rdap/types';
import { tldOf } from '@/lib/validation/domain';

export type RdapOutcome =
  /** The registry returned a domain object. */
  | {
      readonly kind: 'found';
      readonly url: string;
      readonly via: RdapVia;
      readonly data: RdapDomain;
    }
  /** The registry authoritatively reported that the name does not exist. */
  | { readonly kind: 'not-found'; readonly url: string; readonly via: RdapVia }
  /** No RDAP service is published for this TLD. */
  | { readonly kind: 'no-service' }
  /** The registry answered, but not with something we can use. */
  | {
      readonly kind: 'error';
      readonly url: string | null;
      readonly via: RdapVia;
      readonly status: number | null;
      readonly reason: RdapErrorReason;
      readonly message: string;
    };

export type RdapVia = 'iana-bootstrap' | 'rdap-redirector' | 'none';

export type RdapErrorReason = 'timeout' | 'upstream' | 'malformed' | 'blocked' | 'rate_limited';

/** Build the RDAP domain URL for a base endpoint. The domain is encoded. */
export function buildDomainUrl(base: string, domain: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(`domain/${encodeURIComponent(domain)}`, normalizedBase).toString();
}

function describeSafeFetchError(error: SafeFetchError): {
  reason: RdapErrorReason;
  message: string;
} {
  switch (error.kind) {
    case 'timeout':
      return { reason: 'timeout', message: 'The RDAP server did not answer in time.' };
    case 'blocked':
      return { reason: 'blocked', message: 'The RDAP endpoint was rejected by the safety policy.' };
    case 'too_large':
      return { reason: 'upstream', message: 'The RDAP server returned an oversized response.' };
    case 'too_many_redirects':
      return { reason: 'upstream', message: 'The RDAP server redirected too many times.' };
    default:
      return { reason: 'upstream', message: 'The RDAP server could not be reached.' };
  }
}

async function query(url: string, via: RdapVia): Promise<RdapOutcome> {
  let response;
  try {
    response = await safeFetch(url, {
      timeoutMs: RDAP_TIMEOUT_MS,
      headers: {
        accept: 'application/rdap+json, application/json;q=0.9',
        'user-agent': RDAP_USER_AGENT,
      },
    });
  } catch (error) {
    if (error instanceof SafeFetchError) {
      const { reason, message } = describeSafeFetchError(error);
      return { kind: 'error', url, via, status: null, reason, message };
    }
    return {
      kind: 'error',
      url,
      via,
      status: null,
      reason: 'upstream',
      message: 'The RDAP server could not be reached.',
    };
  }

  if (response.status === 404) {
    return { kind: 'not-found', url: response.url, via };
  }
  if (response.status === 429) {
    return {
      kind: 'error',
      url: response.url,
      via,
      status: 429,
      reason: 'rate_limited',
      message: 'The RDAP server is rate limiting TraceZone. Please retry shortly.',
    };
  }
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const payload = JSON.parse(response.body) as RdapErrorResponse;
      detail = typeof payload.title === 'string' ? payload.title : null;
    } catch {
      /* the registry did not send a structured error body */
    }
    return {
      kind: 'error',
      url: response.url,
      via,
      status: response.status,
      reason: 'upstream',
      message: detail ?? `The RDAP server responded with HTTP ${response.status}.`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(response.body);
  } catch {
    return {
      kind: 'error',
      url: response.url,
      via,
      status: response.status,
      reason: 'malformed',
      message: 'The RDAP server returned a response that is not valid JSON.',
    };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      kind: 'error',
      url: response.url,
      via,
      status: response.status,
      reason: 'malformed',
      message: 'The RDAP server returned an unexpected payload.',
    };
  }

  return { kind: 'found', url: response.url, via, data: data as RdapDomain };
}

/**
 * Look a single domain name up.
 *
 * The authoritative endpoint from the IANA bootstrap registry is tried first;
 * rdap.org is used when the TLD is unknown to the registry, or when the
 * authoritative server is unreachable.
 */
export async function lookupRdapDomain(domain: string): Promise<RdapOutcome> {
  const bootstrap = await getBootstrap();
  const base = bootstrap.get(tldOf(domain))?.[0] ?? null;

  if (base !== null) {
    const outcome = await query(buildDomainUrl(base, domain), 'iana-bootstrap');
    if (outcome.kind !== 'error') return outcome;

    // The authoritative server is unhappy — give the redirector one chance
    // before giving up, unless the failure was our own safety policy.
    if (outcome.reason === 'blocked') return outcome;
    const fallback = await query(buildDomainUrl(RDAP_FALLBACK_BASE, domain), 'rdap-redirector');
    return fallback.kind === 'error' ? outcome : fallback;
  }

  const fallback = await query(buildDomainUrl(RDAP_FALLBACK_BASE, domain), 'rdap-redirector');
  // rdap.org answers 404 both for "no such domain" and "no such TLD". We can
  // only tell the two apart when the bootstrap registry actually loaded: a TLD
  // missing from a populated registry genuinely has no RDAP service. When the
  // registry is unavailable we keep the more useful reading, "not registered".
  if (fallback.kind === 'not-found' && bootstrap.size > 0) return { kind: 'no-service' };
  return fallback;
}
