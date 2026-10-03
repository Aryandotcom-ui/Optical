import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { fileURLToPath } from 'node:url';

// One .env at the monorepo root configures every app (see docs/DECISIONS.md, ADR-005).
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== 'production');

const isDev = process.env.NODE_ENV !== 'production';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;

/**
 * Content-Security-Policy (ADR-056). Scripts and styles may be inline
 * because Next streams its data in inline scripts and a per-request nonce
 * would make every page uncacheable; everything else is locked to this
 * site and the API. `wasm-unsafe-eval` is for the face tracker's WebAssembly.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}${isDev ? ' ws: wss:' : ''}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Camera is used only by same-origin try-on and PD tools; everything else is off.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(self), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@optical/config', '@optical/shared'],
  typedRoutes: true,
  images: {
    // AVIF is about a third smaller than WebP for the product renders.
    formats: ['image/avif', 'image/webp'],
  },
  // `SOURCEMAPS=1 pnpm build` emits browser source maps, for attributing bundle bytes.
  productionBrowserSourceMaps: process.env.SOURCEMAPS === '1',
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      {
        // The face tracker's runtime and model (15 MB) change only with the pinned
        // @mediapipe/tasks-vision version: cache for a week, then revalidate.
        source: '/mediapipe/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
    ]);
  },
};

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: {
    // ICU messages are compiled at build time, so the browser never downloads
    // the message parser (about 7 kB gzipped).
    messages: { format: 'json', path: './messages', locales: 'infer', precompile: true },
  },
});

export default withNextIntl(nextConfig);
