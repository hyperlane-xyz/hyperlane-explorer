/** @type {import('next').NextConfig} */

const { version } = require('./package.json');

const isDev = process.env.NODE_ENV !== 'production';

const IMG_SRC_HOSTS = [
  'https://raw.githubusercontent.com',
  'https://cdn.jsdelivr.net/gh/hyperlane-xyz/hyperlane-registry@main/',
];

const securityHeaders = [
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self'${
      isDev ? " 'unsafe-eval'" : ''
    }; connect-src *; img-src 'self' data: ${IMG_SRC_HOSTS.join(' ')}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'self'; form-action 'self'`,
  },
];

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  env: {
    NEXT_PUBLIC_VERSION: version,
  },

  reactStrictMode: true,

  experimental: {
    optimizePackageImports: [
      '@hyperlane-xyz/registry',
      '@hyperlane-xyz/sdk',
      '@hyperlane-xyz/utils',
      '@hyperlane-xyz/widgets',
    ],
  },
};

module.exports = nextConfig;
