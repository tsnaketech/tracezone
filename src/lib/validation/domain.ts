/**
 * Domain name validation and normalisation.
 *
 * The goal is to accept what a human would reasonably paste into a lookup box
 * (`EXAMPLE.com `, `https://www.example.com/test?a=1`, an IDN such as `bücher.de`)
 * and turn it into a single, unambiguous, ASCII (punycode) domain name.
 *
 * Anything that cannot be resolved *without guessing* is rejected with a clear
 * reason rather than silently coerced — a lookup tool that quietly answers about
 * a different name than the one you typed is worse than one that says "no".
 */

import { MAX_DOMAIN_CANDIDATES } from '@/lib/config';

export const MAX_DOMAIN_LENGTH = 253;
export const MAX_LABEL_LENGTH = 63;
export const MAX_INPUT_LENGTH = 400;

/** A DNS label, after IDNA conversion: LDH (letters, digits, hyphen). */
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/** A TLD must not be fully numeric (that would be an IPv4 address). */
const ALL_DIGITS = /^\d+$/;

export type DomainValidationErrorReason =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'CONTAINS_WHITESPACE'
  | 'LOOKS_LIKE_EMAIL'
  | 'UNPARSEABLE'
  | 'IP_ADDRESS'
  | 'NOT_A_FQDN'
  | 'INVALID_LABEL'
  | 'LABEL_TOO_LONG'
  | 'INVALID_TLD';

export interface DomainValidationSuccess {
  readonly ok: true;
  /** The raw value supplied by the caller. */
  readonly input: string;
  /** Normalised, lowercase, ASCII/punycode domain without a trailing dot. */
  readonly domain: string;
  /** `true` when the input carried a scheme, path, port or query we stripped. */
  readonly normalized: boolean;
}

export interface DomainValidationFailure {
  readonly ok: false;
  readonly input: string;
  readonly reason: DomainValidationErrorReason;
  readonly message: string;
}

export type DomainValidationResult = DomainValidationSuccess | DomainValidationFailure;

const MESSAGES: Record<DomainValidationErrorReason, string> = {
  EMPTY: 'A domain name is required.',
  TOO_LONG: 'The supplied value is too long to be a domain name.',
  CONTAINS_WHITESPACE: 'A domain name cannot contain spaces.',
  LOOKS_LIKE_EMAIL: 'This looks like an email address or a URL with credentials, not a domain.',
  UNPARSEABLE: 'The supplied value could not be read as a domain name.',
  IP_ADDRESS: 'IP address lookups are not supported yet — supply a domain name.',
  NOT_A_FQDN: 'A fully qualified domain name is required (for example example.com).',
  INVALID_LABEL: 'The domain contains characters that are not valid in a domain name.',
  LABEL_TOO_LONG: `Each part of a domain name must be ${MAX_LABEL_LENGTH} characters or fewer.`,
  INVALID_TLD: 'The top-level domain is not valid.',
};

function fail(input: string, reason: DomainValidationErrorReason): DomainValidationFailure {
  return { ok: false, input, reason, message: MESSAGES[reason] };
}

/** IPv4 dotted quad, e.g. `93.184.216.34`. */
function isIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => ALL_DIGITS.test(part) && part.length <= 3 && Number(part) <= 255);
}

/**
 * Validate and normalise a user-supplied domain name.
 *
 * Normalisation relies on the WHATWG URL parser, which gives us correct IDNA
 * (unicode → punycode) handling and case folding on every supported runtime
 * without pulling in a dependency.
 */
export function validateDomain(rawInput: unknown): DomainValidationResult {
  const input = typeof rawInput === 'string' ? rawInput : '';

  if (input.length > MAX_INPUT_LENGTH) return fail(input, 'TOO_LONG');

  // Strip wrapping whitespace, quotes and angle brackets (common when pasting).
  let candidate = input
    .trim()
    .replace(/^[<"']+|[>"']+$/g, '')
    .trim();
  if (candidate === '') return fail(input, 'EMPTY');

  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate);
  const hadProtocolRelative = candidate.startsWith('//');
  if (hadProtocolRelative) candidate = candidate.slice(2);

  // `user@host` is ambiguous: an email address, or a URL with credentials.
  // Both would silently resolve to a different name than the user typed.
  const authority = hadScheme ? candidate.slice(candidate.indexOf('://') + 3) : candidate;
  if (authority.includes('@')) return fail(input, 'LOOKS_LIKE_EMAIL');

  if (/\s/.test(authority.split('/')[0] ?? '')) return fail(input, 'CONTAINS_WHITESPACE');

  let url: URL;
  try {
    url = new URL(hadScheme ? candidate : `http://${candidate}`);
  } catch {
    // The URL parser refuses a host whose last label is numeric, because it
    // tries to read the whole thing as an IPv4 address. Say so plainly rather
    // than reporting a generic parse failure.
    const host = (authority.split(/[/?#]/)[0] ?? '').split(':')[0] ?? '';
    const lastLabel = host.split('.').at(-1) ?? '';
    return fail(input, ALL_DIGITS.test(lastLabel) ? 'INVALID_TLD' : 'UNPARSEABLE');
  }

  let host = url.hostname.toLowerCase();
  if (host === '') return fail(input, 'UNPARSEABLE');

  // IP literals: `[::1]` from the URL parser, or a dotted quad.
  if (host.startsWith('[') || isIpv4(host)) return fail(input, 'IP_ADDRESS');

  // Root-relative trailing dot is legal in DNS but noise for RDAP.
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host === '') return fail(input, 'UNPARSEABLE');

  if (host.length > MAX_DOMAIN_LENGTH) return fail(input, 'TOO_LONG');

  const labels = host.split('.');
  if (labels.length < 2) return fail(input, 'NOT_A_FQDN');

  for (const label of labels) {
    if (label.length === 0) return fail(input, 'INVALID_LABEL');
    if (label.length > MAX_LABEL_LENGTH) return fail(input, 'LABEL_TOO_LONG');
    if (!LABEL_PATTERN.test(label)) return fail(input, 'INVALID_LABEL');
  }

  const tld = labels.at(-1) as string;
  if (ALL_DIGITS.test(tld) || tld.length < 2) return fail(input, 'INVALID_TLD');

  const normalized = hadScheme || hadProtocolRelative || host !== input.trim().toLowerCase();

  return { ok: true, input, domain: host, normalized };
}

/**
 * Decode a domain that arrived as a URL path segment.
 *
 * A caller may percent-encode a whole URL to fit it into `/api/v1/domain/:domain`.
 * Runtimes differ on whether they hand the segment back decoded, so decode it
 * here when it still looks encoded. A valid domain never contains `%`, so this
 * cannot corrupt a well-formed name.
 */
export function decodeDomainParam(value: string): string {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Build the ordered list of names to ask RDAP about.
 *
 * RDAP only knows about registrable domains, so `www.example.com` has to become
 * `example.com`. Without bundling a public suffix list we cannot know where the
 * registrable boundary is for names such as `example.co.uk`, so instead of
 * guessing we walk up the tree and let the authoritative server decide: the
 * first candidate that answers wins.
 *
 * A leading `www` label is dropped up front because it is never a registrable
 * domain of its own, which saves a wasted upstream request in the common case.
 */
export function domainCandidates(domain: string): string[] {
  let labels = domain.split('.');
  if (labels.length > 2 && labels[0] === 'www') labels = labels.slice(1);

  const candidates: string[] = [];
  while (labels.length >= 2 && candidates.length < MAX_DOMAIN_CANDIDATES) {
    candidates.push(labels.join('.'));
    labels = labels.slice(1);
  }
  return candidates;
}

/** The TLD of a normalised domain, lowercase and without a leading dot. */
export function tldOf(domain: string): string {
  return domain.split('.').at(-1) ?? '';
}
