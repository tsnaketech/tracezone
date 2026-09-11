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

import { BOOTSTRAP_TIMEOUT_MS, BOOTSTRAP_TTL_MS, RDAP_USER_AGENT } from '@/lib/config';
import { safeFetch } from '@/lib/net/safe-fetch';
import type { RdapBootstrapRegistry } from '@/lib/rdap/types';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

/** tld -> ordered list of RDAP base URLs (always ending with a slash). */
export type BootstrapMap = ReadonlyMap<string, readonly string[]>;

interface CacheEntry {
  readonly map: BootstrapMap;
  readonly fetchedAt: number;
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

async function loadBootstrap(): Promise<BootstrapMap> {
  const response = await safeFetch(BOOTSTRAP_URL, {
    timeoutMs: BOOTSTRAP_TIMEOUT_MS,
    headers: { accept: 'application/json', 'user-agent': RDAP_USER_AGENT },
  });
  if (!response.ok) throw new Error(`bootstrap responded with ${response.status}`);
  return parseBootstrap(JSON.parse(response.body) as RdapBootstrapRegistry);
}

/**
 * Return the cached bootstrap map, refreshing it when stale.
 *
 * A failure is never fatal: callers treat an empty map as "no entry" and fall
 * back to the redirector.
 */
export async function getBootstrap(): Promise<BootstrapMap> {
  if (cache !== null && Date.now() - cache.fetchedAt < BOOTSTRAP_TTL_MS) {
    return cache.map;
  }
  if (inFlight !== null) return inFlight;

  inFlight = loadBootstrap()
    .then((map) => {
      cache = { map, fetchedAt: Date.now() };
      return map;
    })
    .catch(() => {
      // Keep a stale map if we have one; otherwise report "unknown".
      return cache?.map ?? new Map<string, readonly string[]>();
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
export async function resolveRdapBase(tld: string): Promise<string | null> {
  const map = await getBootstrap();
  return map.get(tld.toLowerCase())?.[0] ?? null;
}
