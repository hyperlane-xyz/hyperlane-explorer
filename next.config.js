/** @type {import('next').NextConfig} */

const { version } = require('./package.json');

const isDev = process.env.NODE_ENV !== 'production';

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
    }; connect-src *; img-src 'self' data: https://raw.githubusercontent.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'self'; form-action 'self'`,
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

  modularizeImports: {
    '@rainbow-me/rainbowkit': {
      transform: '@rainbow-me/rainbowkit/{{member}}',
      preventFullImport: true
    },
    '@hyperlane-xyz/sdk': {
      transform: '@hyperlane-xyz/sdk/{{member}}',
      preventFullImport: true
    },
    '@hyperlane-xyz/widgets': {
      transform: '@hyperlane-xyz/widgets/{{member}}',
      preventFullImport: true
    }
  },
  
  experimental: {
    optimizePackageImports: ['@rainbow-me/rainbowkit', '@hyperlane-xyz/sdk', '@hyperlane-xyz/widgets']
  }
};

module.exports = nextConfig;
