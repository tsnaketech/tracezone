/**
 * Domain lookup orchestration.
 *
 * Validate -> resolve the registrable name -> query RDAP -> normalise. This is
 * the single entry point used by both the HTTP API and the server-rendered
 * result page, so the two can never drift apart.
 */

import { ApiError } from '@/lib/api/errors';
import { LOOKUP_DEADLINE_MS } from '@/lib/config';
import { createDeadline, type Deadline } from '@/lib/net/deadline';
import type { DomainLookupResult, LookupSource } from '@/lib/lookup/types';
import { lookupRdapDomain, type RdapOutcome } from '@/lib/rdap/client';
import {
  normalizeDates,
  normalizeDnssec,
  normalizeEntities,
  normalizeIdentity,
  normalizeNameservers,
  normalizeRedaction,
  normalizeRegistrar,
  normalizeTextBlocks,
} from '@/lib/rdap/normalize';
import type { RdapDomain } from '@/lib/rdap/types';
import { domainCandidates, validateDomain } from '@/lib/validation/domain';

export interface DomainLookupOptions {
  /** Include the untouched RDAP payload in the result. Defaults to `true`. */
  readonly includeRaw?: boolean;
  /**
   * Wall-clock budget for the whole lookup, upstream calls included. Defaults
   * to {@link LOOKUP_DEADLINE_MS}, which is set below the serverless function's
   * own limit so we always answer before the platform cuts us off.
   */
  readonly deadline?: Deadline;
}

function emptySource(): LookupSource {
  return {
    protocol: 'rdap',
    url: null,
    resolvedVia: 'none',
    retrievedAt: new Date().toISOString(),
  };
}

function unregisteredResult(query: string, outcome: RdapOutcome, warnings: string[]) {
  const source: LookupSource =
    outcome.kind === 'not-found'
      ? {
          protocol: 'rdap',
          url: outcome.url,
          resolvedVia: outcome.via,
          retrievedAt: new Date().toISOString(),
        }
      : emptySource();

  return {
    query,
    type: 'domain',
    registered: false,
    availability: 'possibly_available',
    source,
    domain: null,
    registrar: null,
    dates: null,
    nameservers: [],
    dnssec: null,
    entities: [],
    redaction: { applied: false, fields: [] },
    notices: [],
    remarks: [],
    warnings,
    raw: null,
  } satisfies DomainLookupResult;
}

function registeredResult(
  query: string,
  resolvedName: string,
  outcome: Extract<RdapOutcome, { kind: 'found' }>,
  warnings: string[],
  includeRaw: boolean,
): DomainLookupResult {
  const data: RdapDomain = outcome.data;

  return {
    query,
    type: 'domain',
    registered: true,
    availability: 'registered',
    source: {
      protocol: 'rdap',
      url: outcome.url,
      resolvedVia: outcome.via,
      retrievedAt: new Date().toISOString(),
    },
    domain: normalizeIdentity(data, resolvedName.toUpperCase()),
    registrar: normalizeRegistrar(data),
    dates: normalizeDates(data),
    nameservers: normalizeNameservers(data),
    dnssec: normalizeDnssec(data),
    entities: normalizeEntities(data),
    redaction: normalizeRedaction(data),
    notices: normalizeTextBlocks(data.notices),
    remarks: normalizeTextBlocks(data.remarks),
    warnings,
    raw: includeRaw ? data : null,
  };
}

/**
 * Run a full domain lookup.
 *
 * Throws {@link ApiError} for anything a caller must surface as an HTTP error;
 * a domain that simply does not exist is a successful lookup, not an error.
 */
export async function lookupDomain(
  rawInput: string,
  options: DomainLookupOptions = {},
): Promise<DomainLookupResult> {
  const includeRaw = options.includeRaw ?? true;
  const deadline = options.deadline ?? createDeadline(LOOKUP_DEADLINE_MS);

  const validation = validateDomain(rawInput);
  if (!validation.ok) {
    throw new ApiError('INVALID_DOMAIN', validation.message);
  }

  const query = validation.domain;
  const candidates = domainCandidates(query);
  if (candidates.length === 0) {
    throw new ApiError('INVALID_DOMAIN', 'A registrable domain name is required.');
  }

  const warnings: string[] = [];
  let lastOutcome: RdapOutcome | null = null;

  for (const [index, candidate] of candidates.entries()) {
    // Walking up the tree is the one place the lookup fans out, so check the
    // budget before spending it rather than after.
    if (deadline.expired()) {
      throw new ApiError(
        'UPSTREAM_TIMEOUT',
        'The lookup ran out of time before every candidate name could be checked.',
      );
    }

    const outcome = await lookupRdapDomain(candidate, deadline);
    lastOutcome = outcome;

    if (outcome.kind === 'found') {
      if (candidate !== query) {
        warnings.push(
          `${query} is not a registrable domain; RDAP data is reported for ${candidate}.`,
        );
      }
      if (outcome.via === 'rdap-redirector') {
        warnings.push('Resolved through the rdap.org redirector rather than the IANA registry.');
      }
      return registeredResult(query, candidate, outcome, warnings, includeRaw);
    }

    if (outcome.kind === 'no-service') {
      // Distinct from "this name does not exist": the name may well be
      // registered, we simply have no protocol to ask. This is where a WHOIS
      // fallback would slot in.
      throw new ApiError('RDAP_UNSUPPORTED_TLD');
    }

    if (outcome.kind === 'error') {
      if (outcome.reason === 'timeout') {
        throw new ApiError('UPSTREAM_TIMEOUT', outcome.message);
      }
      if (outcome.reason === 'rate_limited') {
        throw new ApiError('RATE_LIMITED', outcome.message);
      }
      throw new ApiError('RDAP_ERROR', outcome.message);
    }

    // `not-found`: try the parent domain, unless this was the last candidate.
    const isLast = index === candidates.length - 1;
    if (!isLast) {
      warnings.push(`${candidate} is not registered; checked its parent domain as well.`);
      continue;
    }
  }

  return unregisteredResult(query, lastOutcome as RdapOutcome, warnings);
}
