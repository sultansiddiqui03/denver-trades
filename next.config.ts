import type { NextConfig } from 'next';

const securityHeaders = [
  // HSTS — force HTTPS for 1 year, opt into preload list.
  // Only active on production (HTTP→HTTPS), so safe to ship without breaking local dev.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  // Block clickjacking — we render nowhere in iframes.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stop MIME sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak full URLs to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Lock down browser APIs we don't use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Disable Chromium's DNS prefetch for cross-origin links by default.
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  // No remote images in use yet. Add patterns here when we wire avatars / logos.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
