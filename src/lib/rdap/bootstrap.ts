/**
 * IANA RDAP bootstrap registry (RFC 9224).
 *
 * Resolving the authoritative RDAP server ourselves means a domain lookup talks
 * straight to the registry instead of relying on a third-party redirector for
 * every request. The registry is small, changes rarely, and is cached in module
 * memory for the lifetime of the serverless instance.
 *
 * If the registry cannot be fetched — or has no entry for the TLD — we fall back
 * to rdap.org, which performs the same resolution server-side.
 */

import {
  BOOTSTRAP_FAILURE_TTL_MS,
  BOOTSTRAP_TIMEOUT_MS,
  BOOTSTRAP_TTL_MS,
  RDAP_USER_AGENT,
} from '@/lib/config';
import { unlimitedDeadline, type Deadline } from '@/lib/net/deadline';
import { safeFetch } from '@/lib/net/safe-fetch';
import type { RdapBootstrapRegistry } from '@/lib/rdap/types';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

/** tld -> ordered list of RDAP base URLs (always ending with a slash). */
export type BootstrapMap = ReadonlyMap<string, readonly string[]>;

interface CacheEntry {
  readonly map: BootstrapMap;
  readonly fetchedAt: number;
  /** How long this entry stays fresh — short when it records a failure. */
  readonly ttlMs: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<BootstrapMap> | null = null;

/** Parse the registry document into a TLD → base URL lookup table. */
export function parseBootstrap(registry: RdapBootstrapRegistry): BootstrapMap {
  const map = new Map<string, readonly string[]>();

  for (const service of registry.services ?? []) {
    const [tlds, urls] = service;
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;

    const bases = urls
      .filter((url): url is string => typeof url === 'string')
      .filter((url) => url.startsWith('https://'))
      .map((url) => (url.endsWith('/') ? url : `${url}/`));
    if (bases.length === 0) continue;

    for (const tld of tlds) {
      if (typeof tld !== 'string' || tld === '') continue;
      map.set(tld.toLowerCase(), bases);
    }
  }

  return map;
}

async function loadBootstrap(deadline: Deadline): Promise<BootstrapMap> {
  const response = await safeFetch(BOOTSTRAP_URL, {
    timeoutMs: deadline.budget(BOOTSTRAP_TIMEOUT_MS),
    headers: { accept: 'application/json', 'user-agent': RDAP_USER_AGENT },
  });
  if (!response.ok) throw new Error(`bootstrap responded with ${response.status}`);
  return parseBootstrap(JSON.parse(response.body) as RdapBootstrapRegistry);
}

/**
 * Return the cached bootstrap map, refreshing it when stale.
 *
 * A failure is never fatal: callers treat an empty map as "no entry" and fall
 * back to the redirector. Failures are cached too, briefly — otherwise every
 * lookup re-pays the timeout for as long as IANA is down, which is precisely
 * when the caller can least afford it.
 */
export async function getBootstrap(
  deadline: Deadline = unlimitedDeadline(),
): Promise<BootstrapMap> {
  if (cache !== null && Date.now() - cache.fetchedAt < cache.ttlMs) {
    return cache.map;
  }
  if (inFlight !== null) return inFlight;

  // Not worth spending what little budget is left on a registry we can work
  // without: fall straight through to the redirector.
  if (deadline.budget(BOOTSTRAP_TIMEOUT_MS) <= 0) {
    return cache?.map ?? new Map<string, readonly string[]>();
  }

  inFlight = loadBootstrap(deadline)
    .then((map) => {
      cache = { map, fetchedAt: Date.now(), ttlMs: BOOTSTRAP_TTL_MS };
      return map;
    })
    .catch(() => {
      // Keep a stale map if we have one; otherwise report "unknown". Either way
      // remember the failure so the next caller does not wait on it again.
      const map = cache?.map ?? new Map<string, readonly string[]>();
      cache = { map, fetchedAt: Date.now(), ttlMs: BOOTSTRAP_FAILURE_TTL_MS };
      return map;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Test seam: drop the cached registry. */
export function resetBootstrapCache(): void {
  cache = null;
  inFlight = null;
}

/** The authoritative RDAP base URL for a TLD, or `null` when unknown. */
export async function resolveRdapBase(tld: string, deadline?: Deadline): Promise<string | null> {
  const map = await getBootstrap(deadline);
  return map.get(tld.toLowerCase())?.[0] ?? null;
}
