# TraceZone

**Inspect domains. Trace infrastructure.**

TraceZone is a technical lookup tool for RDAP (Registration Data Access Protocol). Type a domain
name, get its registration data — registrar, dates, nameservers, DNSSEC, status codes and public
contacts — presented for humans, and available programmatically over a public HTTP API in **JSON**
and **TOON**.

It is built for developers, sysadmins, security teams, SOC analysts and researchers: no account, no
tracking, no WHOIS scraping, and the raw RDAP payload is always one click away.

---

## Stack

| Concern         | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| Framework       | [Astro](https://astro.build) 7 (static-first, SSR on demand) |
| Language        | TypeScript, `strictest`                                      |
| Styling         | Tailwind CSS 4                                               |
| Interactivity   | Svelte 5 islands — only where client JS is genuinely needed  |
| Serialisation   | `@toon-format/toon` (reference TOON implementation)          |
| Tests           | Vitest                                                       |
| Hosting         | Vercel (`@astrojs/vercel`)                                   |
| Package manager | pnpm                                                         |

There is no database, no authentication and no global state manager. RDAP is the only upstream.

---

## Getting started

Requires **Node.js 22.12+** (24 LTS recommended) and **pnpm 10**, pinned through
`package.json#packageManager` so local, CI and Vercel builds all use the same version.

```bash
git clone https://github.com/tsnaketech/tracezone
cd tracezone
pnpm install
pnpm dev
```

The app is served at <http://localhost:4321>.

### Scripts

| Script              | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `pnpm dev`          | Dev server with HMR                                             |
| `pnpm build`        | Production build (Vercel output)                                |
| `pnpm preview`      | Preview the production build                                    |
| `pnpm lint`         | ESLint over TS, Astro and Svelte                                |
| `pnpm format`       | Rewrite files with Prettier                                     |
| `pnpm format:check` | Verify formatting                                               |
| `pnpm typecheck`    | `astro check` (types across `.ts`, `.astro`, `.svelte`)         |
| `pnpm test`         | Vitest, single run                                              |
| `pnpm test:watch`   | Vitest in watch mode                                            |
| `pnpm check`        | **Everything above, in the order CI runs it.** Run before merge |

### Environment variables

None are required. `PUBLIC_SITE_URL` is optionally read at build time to set the canonical and
OpenGraph origin when deploying to a custom domain; it defaults to `https://tracezone.vercel.app`.

---

## API

Base URL in the examples below: `https://tracezone.vercel.app`.

### `GET /api/v1/domain/:domain`

```bash
# JSON (default)
curl "https://tracezone.vercel.app/api/v1/domain/example.com"

# TOON via query parameter
curl "https://tracezone.vercel.app/api/v1/domain/example.com?format=toon"

# TOON via content negotiation
curl -H "Accept: text/toon" "https://tracezone.vercel.app/api/v1/domain/example.com"

# Skip the raw RDAP payload
curl "https://tracezone.vercel.app/api/v1/domain/example.com?raw=false"
```

| Parameter | In    | Values         | Notes                                                                                                               |
| --------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `:domain` | path  | required       | URLs, trailing dots, uppercase and IDN input are normalised.                                                        |
| `format`  | query | `json`, `toon` | **Takes precedence over `Accept`.** Unknown values are a 400.                                                       |
| `raw`     | query | `true`/`false` | Include the untouched RDAP object. Defaults to `true`. Also accepts `1`/`0` and `yes`/`no`; anything else is a 400. |

The response is a TraceZone document, not an RDAP passthrough — field names are stable across
registries and dates are ISO 8601:

```jsonc
{
  "query": "example.com",
  "type": "domain",
  "registered": true,
  "availability": "registered",
  "source": { "protocol": "rdap", "url": "…", "resolvedVia": "iana-bootstrap", "retrievedAt": "…" },
  "domain": { "name": "EXAMPLE.COM", "unicodeName": null, "handle": "…", "statuses": [] },
  "registrar": {
    "name": "…",
    "handle": "…",
    "ianaId": "…",
    "url": "…",
    "abuseEmail": "…",
    "abusePhone": "…",
  },
  "dates": { "created": "…", "updated": "…", "expires": "…", "transferred": null, "events": [] },
  "nameservers": [{ "name": "A.IANA-SERVERS.NET", "unicodeName": null, "ipv4": [], "ipv6": [] }],
  "dnssec": { "status": "signed", "delegationSigned": true, "zoneSigned": null, "dsRecords": [] },
  "entities": [],
  "redaction": { "applied": false, "fields": [] },
  "notices": [],
  "remarks": [],
  "warnings": [],
  "raw": {},
}
```

The TOON body carries **exactly the same data**, just serialised differently:

```toon
query: example.com
type: domain
registered: true
availability: registered
domain:
  name: EXAMPLE.COM
  statuses[3]: client delete prohibited,client transfer prohibited,client update prohibited
nameservers[2]{name,unicodeName,ipv4,ipv6}:
  …
```

### Availability

When the authoritative RDAP server reports that a name does not exist, the lookup still **succeeds**
with HTTP 200 and `registered: false`, `availability: "possibly_available"`.

> `possibly_available` means only that RDAP does not report the domain as registered. It is **not a
> commercial guarantee of availability** — registry lag, reserved and premium names, pending
> registrations and TLD-specific rules all mean a name can be unavailable to buy while RDAP returns
> nothing. Confirm with a registrar before acting on it.

### Errors

```json
{ "error": { "code": "INVALID_DOMAIN", "message": "The supplied domain name is invalid." } }
```

Errors are rendered in the negotiated format, so a TOON client never receives a JSON error body.

| Code                   | HTTP | Meaning                                                    |
| ---------------------- | ---- | ---------------------------------------------------------- |
| `INVALID_DOMAIN`       | 400  | The name could not be parsed unambiguously.                |
| `INVALID_FORMAT`       | 400  | `?format=` named an unsupported format.                    |
| `INVALID_PARAMETER`    | 400  | A query parameter carried an unsupported value.            |
| `METHOD_NOT_ALLOWED`   | 405  | Only `GET` and `OPTIONS` are accepted.                     |
| `RATE_LIMITED`         | 429  | Too many requests; see `Retry-After`.                      |
| `INTERNAL_ERROR`       | 500  | Unexpected failure. Never carries internal detail.         |
| `RDAP_UNSUPPORTED_TLD` | 501  | This TLD publishes no RDAP service (`.de`, `.io`, `.cn`…). |
| `RDAP_ERROR`           | 502  | The registry answered with an error.                       |
| `UPSTREAM_TIMEOUT`     | 504  | The registry did not answer within the 8 s budget.         |

A non-GET request carrying no matching `Origin` header is rejected with a
plain-text `403` by the framework's cross-site guard before it reaches the
endpoint, so it does not use the envelope above; with a matching `Origin` you get
the expected `405`. The API is read-only, so the guard protects nothing here, but
it is left in place rather than disabled globally.

`DOMAIN_NOT_FOUND` (404) exists in the vocabulary but the domain endpoint never
returns it: a name no registry knows is a _successful_ lookup reporting
`registered: false`. It is reserved for lookup kinds where absence is a genuine
error. Note the distinction `RDAP_UNSUPPORTED_TLD` draws — `denic.de` is plainly
registered; `.de` simply publishes no RDAP service, so we cannot answer.

### `GET /api/health`

```bash
curl "https://tracezone.vercel.app/api/health"
# {"status":"ok"}
```

Reports that the deployment is serving. It does not probe RDAP registries.

### Limits and caching

- **Rate limit** — a best-effort 60 requests / 60 s per client address, deliberately **not**
  advertised with `X-RateLimit-*` headers: the counter is in-memory and therefore per serverless
  instance, and edge cache hits never reach the function at all, so any published budget would be
  fiction. Rejections still carry `Retry-After`. Swap in a shared store by implementing
  `RateLimiter` in `src/lib/api/rate-limit.ts`, and reinstate the headers at that point.
- **CORS** — every API response sends `Access-Control-Allow-Origin: *` and `OPTIONS` answers
  preflight requests, so browser clients on any origin can call the API. No credentials are
  involved, which is what makes the wildcard safe.
- **Caching** — successful lookups are cached at the edge for 1 hour with a 1-day
  `stale-while-revalidate`; unregistered answers for 5 minutes; errors are never cached.
- **Upstream budget** — RDAP requests time out after 8 s, responses over 2 MB are refused, and at
  most 3 redirects are followed.

---

## Architecture

```
src/
  pages/
    index.astro              search (prerendered)
    docs.astro               API documentation (prerendered)
    404.astro
    domain/[domain].astro    shareable result page (on demand)
    api/health.ts
    api/v1/domain/[domain].ts
  layouts/BaseLayout.astro
  components/                cards, badges, search bar, raw viewer…
  middleware.ts              security headers for on-demand responses
  styles/global.css          design tokens, dark + light themes
  lib/
    config.ts                every tunable constant and limit
    validation/domain.ts     normalisation, IDN → punycode, candidate names
    net/safe-fetch.ts        HTTPS-only, anti-SSRF, timeout, size cap
    rdap/
      bootstrap.ts           IANA RDAP bootstrap registry (RFC 9224)
      client.ts              the only place an RDAP URL is built or fetched
      normalize.ts           RDAP → TraceZone model
      vcard.ts               jCard (RFC 7095) extraction
      types.ts               RDAP wire types
    lookup/
      domain.ts              orchestration: validate → RDAP → normalise
      types.ts               the public TraceZone data model
    serialization/           json.ts · toon.ts · serialize(data, format)
    api/                     errors.ts · response.ts · format.ts · rate-limit.ts
    format.ts                display-only helpers (dates, status labels)
tests/                       Vitest suites + an RDAP fixture
```

### Design notes

- **Static-first.** The home page, the docs and the 404 are prerendered and served from the CDN.
  Only `/domain/:domain` and the API routes opt out with `export const prerender = false`.
- **Svelte only where it earns its place.** Three islands: the search bar, the copy button and the
  theme toggle. The result tabs are a bundled vanilla script over server-rendered markup, so the
  whole result — including the JSON and TOON views — is readable with JavaScript disabled.
- **The frontend never talks to a registry.** The result page calls `lookupDomain()` server-side; the
  browser only ever talks to TraceZone.
- **RDAP resolution.** The TLD's authoritative server is resolved from the IANA bootstrap registry
  (cached in instance memory for 24 h); `rdap.org` is the fallback when the registry is unreachable
  or has no entry. `source.resolvedVia` reports which path answered.
- **Registrable name resolution.** RDAP only knows registrable domains. Rather than bundling a public
  suffix list, TraceZone drops a leading `www` and walks up the tree (at most 3 hops), letting the
  authoritative server decide where the registrable boundary is. `warnings` records when this
  happened, so `a.b.example.co.uk` resolves correctly without guessing.
- **Redaction is respected.** RFC 9537 redaction is surfaced (`redaction.applied`, `redaction.fields`)
  and never worked around.
- **Adding a lookup type** means adding `src/lib/lookup/<kind>.ts` plus a result type with the same
  `query` / `type` / `source` head, and a route. IP, ASN, DNS, TLS and header lookups were the shape
  this model was designed around; none of them are implemented yet.

### Security

- Strict input validation; a name that cannot be resolved unambiguously is rejected, not guessed.
- **No user-supplied URL ever reaches the network.** RDAP URLs are built in `rdap/client.ts` from a
  constant base plus one URL-encoded path segment. There is deliberately no `/api/proxy?url=…`.
- `safe-fetch.ts` enforces HTTPS only, no credentials in the URL, default port only, no IP literals
  or non-public hostnames, manual redirect following re-validated at every hop, a wall-clock timeout
  and a hard byte cap.
- Security headers on every response (`middleware.ts` for on-demand routes, `vercel.json` for the
  static layer). The Content-Security-Policy is generated by Astro with per-page hashes for its own
  inline scripts and scoped styles, so `script-src` needs no `'unsafe-inline'`.
- Errors never carry a stack trace or internal detail; client addresses are used as a rate-limit key
  and are never logged.

---

## Tests

```bash
pnpm test
```

144 tests covering domain validation and normalisation, RDAP parsing (dates, registrar, jCard
contacts, DNSSEC, redaction), the TOON/JSON serialisers and their round-trip equivalence, format
negotiation and its precedence rules, the SSRF guard, RDAP URL construction, upstream error mapping
and the rate limiter.

---

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project** and import `tsnaketech/tracezone`.
3. Vercel detects Astro and reads `vercel.json`; no settings need changing. No environment variables
   are required.
4. Deploy.

The build produces `.vercel/output/` via `@astrojs/vercel`: prerendered pages as static assets, and
a single Node function for `/domain/:domain` and the API routes.

> **Note on `pnpm-workspace.yaml`.** The project pins `nodeLinker: hoisted`. Astro's build output and
> the Vercel adapter's function bundler both resolve dependencies by walking up from the build output
> directory, which pnpm's default isolated layout cannot satisfy without symlinks. Hoisting makes
> `pnpm build` behave identically on Linux, macOS and Windows.

---

## Roadmap

The MVP is deliberately scoped to **domain + RDAP**. The architecture was shaped to absorb, later:
IP and ASN lookups, DNS and reverse DNS, WHOIS fallback, DNS propagation, TLS certificate inspection,
HTTP header inspection, technology detection, reputation lookups, history, API keys and quotas.

---

## Licence

MIT.
