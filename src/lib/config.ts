/**
 * Central runtime configuration for TraceZone.
 *
 * Everything here is a build-time constant on purpose: the MVP needs no
 * environment variables, and keeping the values in one module makes the
 * security-relevant limits easy to audit.
 */

export const APP_NAME = 'TraceZone';
export const APP_TAGLINE = 'Inspect domains. Trace infrastructure.';
export const APP_DESCRIPTION =
  'Inspect domain registration data, nameservers, registrar information and RDAP records.';
export const APP_REPOSITORY = 'https://github.com/tsnaketech/tracezone';

/**
 * Time budget, from the outside in.
 *
 * The invariant that matters: LOOKUP_DEADLINE_MS must stay comfortably below
 * FUNCTION_MAX_DURATION_S, so the lookup always gives up on its own terms and
 * returns a clean UPSTREAM_TIMEOUT. If the platform kills the invocation first,
 * the caller gets an opaque platform error instead. `tests/budget.test.ts`
 * guards the ordering.
 */

/**
 * Serverless function ceiling, in seconds. Kept deliberately low — every plan
 * allows at least this much, so the deployment cannot fail on a plan limit.
 * Mirrored in `astro.config.mjs`, which is where the adapter reads it.
 */
export const FUNCTION_MAX_DURATION_S = 10;

/** Whole-lookup budget, shared by every upstream call the lookup makes. */
export const LOOKUP_DEADLINE_MS = 8_000;

/** Per-request RDAP budget. Also capped by whatever the deadline has left. */
export const RDAP_TIMEOUT_MS = 5_000;

/** Timeout for the IANA bootstrap document (cheap to skip, so keep it short). */
export const BOOTSTRAP_TIMEOUT_MS = 3_000;
/** Hard cap on any upstream response body we are willing to buffer. */
export const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
/** Maximum number of HTTP redirects followed when talking to an RDAP server. */
export const MAX_REDIRECTS = 3;
/** How long the IANA bootstrap registry is reused inside a single instance. */
export const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * How long a *failed* bootstrap fetch is remembered.
 *
 * Without this, every lookup — and every candidate within a lookup — re-pays
 * BOOTSTRAP_TIMEOUT_MS for as long as IANA is unreachable, which is exactly when
 * the budget is most precious. Short enough to recover quickly once it is back.
 */
export const BOOTSTRAP_FAILURE_TTL_MS = 60_000;

/**
 * RDAP redirector used when the IANA bootstrap registry is unreachable or has
 * no entry for the requested TLD. The URL is a constant: user input is only
 * ever appended as an encoded path segment.
 */
export const RDAP_FALLBACK_BASE = 'https://rdap.org/';

/** User agent sent to RDAP servers, as recommended by RFC 9083 deployments. */
export const RDAP_USER_AGENT = `TraceZone/0.1 (+${APP_REPOSITORY})`;

/**
 * Maximum number of parent-domain lookups attempted for a deep name such as
 * `a.b.example.co.uk`. Bounds upstream fan-out.
 */
export const MAX_DOMAIN_CANDIDATES = 3;

/** Cache-Control values (seconds). Tuned for Vercel's CDN. */
export const CACHE_REGISTERED_S_MAXAGE = 3_600;
export const CACHE_REGISTERED_SWR = 86_400;
export const CACHE_UNREGISTERED_S_MAXAGE = 300;
export const CACHE_UNREGISTERED_SWR = 3_600;

/** In-memory rate limit applied per client IP to the public API. */
export const RATE_LIMIT_MAX_REQUESTS = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Example domains offered under the search box.
 * Chosen to be stable, well-known and safe to hammer.
 */
export const EXAMPLE_DOMAINS = ['example.com', 'cloudflare.com', 'vercel.com'] as const;
