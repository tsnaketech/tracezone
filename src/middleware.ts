/**
 * Security headers for every on-demand response.
 *
 * The Content-Security-Policy is *not* set here: Astro emits it as a meta
 * policy with per-page hashes for its own inline scripts and scoped styles
 * (see `security.csp` in `astro.config.mjs`). Sending a second, header-level
 * CSP would be intersected with that one and would block those hashes again.
 *
 * `frame-ancestors` has no meaning in a meta policy, so framing is denied with
 * X-Frame-Options below.
 *
 * Prerendered pages are served straight from the CDN and never reach this
 * middleware, so the same headers are declared in `vercel.json` for the static
 * layer. Keep the two lists in sync.
 */

import { defineMiddleware } from 'astro:middleware';

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
});
