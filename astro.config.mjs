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
  adapter: vercel(),
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
