// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

const site = process.env.PUBLIC_SITE_URL ?? 'https://tracezone.vercel.app';

// TraceZone is static-first: the landing page and the docs are prerendered and
// served from the CDN. Only the routes that need a live RDAP call opt out of
// prerendering (`export const prerender = false`).
export default defineConfig({
  site,
  output: 'static',
  adapter: vercel({
    // Keep in sync with FUNCTION_MAX_DURATION_S in src/lib/config.ts. It must
    // stay above LOOKUP_DEADLINE_MS so a slow registry produces our own
    // UPSTREAM_TIMEOUT rather than an opaque platform timeout page. Ten seconds
    // is allowed on every plan, so the deployment cannot fail on a plan limit.
    maxDuration: 10,
  }),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  devToolbar: { enabled: false },
  build: { format: 'directory' },

  // Astro owns the Content-Security-Policy: it hashes its own inline hydration
  // scripts and scoped styles at build time, which lets `script-src` stay free
  // of 'unsafe-inline'. The remaining directives are declared here so the whole
  // policy lives in one place. `frame-ancestors` cannot be expressed in a meta
  // policy, so framing is denied with X-Frame-Options instead (see middleware).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
});
