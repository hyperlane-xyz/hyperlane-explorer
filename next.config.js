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
    value: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${
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

  // Skip linting and type checking during builds — CI runs these separately
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Transpile ESM packages for Jest compatibility and webpack aliases
  transpilePackages: [
    '@hyperlane-xyz/core',
    '@hyperlane-xyz/cosmos-sdk',
    '@hyperlane-xyz/cosmos-types',
    '@hyperlane-xyz/deploy-sdk',
    '@hyperlane-xyz/provider-sdk',
    '@hyperlane-xyz/radix-sdk',
    '@hyperlane-xyz/registry',
    '@hyperlane-xyz/sdk',
    '@hyperlane-xyz/starknet-core',
    '@hyperlane-xyz/utils',
    '@hyperlane-xyz/widgets',
    'lodash-es',
  ],

  // Configure webpack to mock modules that break during SSR
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Replace pino with a mock to avoid pino-pretty transport issues
        pino: require.resolve('./src/utils/pino-noop.js'),
        // Replace aleo-sdk with a mock to avoid @provablehq/wasm top-level fetch() error
        '@hyperlane-xyz/aleo-sdk': require.resolve('./src/utils/aleo-sdk-noop.js'),
      };

      config.resolve.alias = {
        ...config.resolve.alias,
        '@provablehq/wasm': false,
        '@provablehq/sdk': false,
      };
    }

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };


    return config;
  },

  experimental: {
    webpackBuildWorker: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
    optimizePackageImports: [
      '@hyperlane-xyz/registry',
      '@hyperlane-xyz/sdk',
      '@hyperlane-xyz/utils',
      '@hyperlane-xyz/widgets',
    ],
  },
};

module.exports = nextConfig;
