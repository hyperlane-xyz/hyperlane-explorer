import { GithubRegistry } from '@hyperlane-xyz/registry';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { MultiProviderAdapter } from '@hyperlane-xyz/sdk/providers/MultiProviderAdapter';
import { defaultSolProviderBuilder } from '@hyperlane-xyz/sdk/providers/providerBuilders';
import { ProviderType } from '@hyperlane-xyz/sdk/providers/ProviderType';
import { createSealevelHypAdapter } from '@hyperlane-xyz/sdk/token/adapters/sealevelHyp';
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import type { WarpRouteConfigs } from '@hyperlane-xyz/sdk/warp/read';
import type { NextApiRequest, NextApiResponse } from 'next';

import { config } from '../../consts/config';
import { SUPPORTED_SEALEVEL_BALANCE_STANDARDS } from '../../features/messages/warpVisualization/tokenStandards';
import { logger } from '../../utils/logger';

const SEALEVEL_STANDARDS = new Set<string>(SUPPORTED_SEALEVEL_BALANCE_STANDARDS);
const MISSING_BALANCE_ACCOUNT_ERRORS = ['could not find account'];
const REGISTRY_DATA_CACHE_MS = 5 * 60 * 1000;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_VALUES = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]));
const SEALEVEL_STANDARDS_REQUIRING_COLLATERAL = new Set<string>([
  TokenStandard.SealevelHypCollateral,
  TokenStandard.SealevelHypCrossCollateral,
  TokenStandard.SealevelHypSynthetic,
]);

interface RegistryData {
  chains: Record<string, ChainMetadata>;
  warpRouteConfigs: WarpRouteConfigs;
}

let registryDataRequest: Promise<RegistryData> | null = null;
let registryDataExpiresAt = 0;
const multiProviders = new Map<string, MultiProviderAdapter<{ mailbox?: string }>>();

function getSingleQueryParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function isMissingBalanceAccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return MISSING_BALANCE_ACCOUNT_ERRORS.some((snippet) => lowerMessage.includes(snippet));
}

function isValidSealevelAddress(value: string): boolean {
  const bytes = decodeBase58(value);
  return bytes?.length === 32;
}

function decodeBase58(value: string): number[] | undefined {
  if (!value) return undefined;

  const bytes = [0];
  for (const char of value) {
    const charValue = BASE58_VALUES.get(char);
    if (charValue === undefined) return undefined;

    let carry = charValue;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return bytes.reverse();
}

function getMultiProvider(chainName: string, chain: ChainMetadata) {
  const cached = multiProviders.get(chainName);
  if (cached) return cached;

  const multiProvider = new MultiProviderAdapter(
    { [chainName]: chain as ChainMetadata<{ mailbox?: string }> },
    { providerBuilders: { [ProviderType.SolanaWeb3]: defaultSolProviderBuilder } },
  );
  multiProviders.set(chainName, multiProvider);
  return multiProvider;
}

function isRegisteredTokenRequest(
  warpRouteConfigs: WarpRouteConfigs,
  {
    chainName,
    addressOrDenom,
    collateralAddressOrDenom,
    standard,
  }: {
    chainName: string;
    addressOrDenom: string;
    collateralAddressOrDenom?: string;
    standard: string;
  },
): boolean {
  return Object.values(warpRouteConfigs).some((config) =>
    config.tokens.some(
      (token) =>
        token.chainName === chainName &&
        token.addressOrDenom === addressOrDenom &&
        token.standard === standard &&
        (token.collateralAddressOrDenom || undefined) === collateralAddressOrDenom,
    ),
  );
}

async function getRegistryData() {
  if (!registryDataRequest || (registryDataExpiresAt > 0 && Date.now() >= registryDataExpiresAt)) {
    registryDataExpiresAt = 0;
    multiProviders.clear();
    const registry = new GithubRegistry({
      proxyUrl: config.githubProxy,
      uri: config.registryUrl,
      branch: config.registryBranch,
    });
    registryDataRequest = Promise.all([
      registry.getMetadata(),
      registry.getAddresses(),
      registry.getWarpRoutes(),
    ])
      .then(([metadata, addresses, warpRouteConfigs]) => {
        const chains: Record<string, ChainMetadata> = {};
        for (const [chainName, chainMetadata] of Object.entries(metadata)) {
          chains[chainName] = {
            ...chainMetadata,
            ...addresses[chainName],
          };
        }
        registryDataExpiresAt = Date.now() + REGISTRY_DATA_CACHE_MS;
        return { chains, warpRouteConfigs };
      })
      .catch((error) => {
        registryDataRequest = null;
        registryDataExpiresAt = 0;
        multiProviders.clear();
        throw error;
      });
  }
  return registryDataRequest;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const chainName = getSingleQueryParam(req.query.chainName);
  const addressOrDenom = getSingleQueryParam(req.query.addressOrDenom);
  const collateralAddressOrDenom = getSingleQueryParam(req.query.collateralAddressOrDenom);
  const standard = getSingleQueryParam(req.query.standard);

  if (!chainName || !addressOrDenom || !standard || !SEALEVEL_STANDARDS.has(standard)) {
    return res.status(400).json({ error: 'Unsupported balance request' });
  }

  if (
    !isValidSealevelAddress(addressOrDenom) ||
    (!!collateralAddressOrDenom && !isValidSealevelAddress(collateralAddressOrDenom))
  ) {
    return res.status(400).json({ error: 'Invalid Sealevel address' });
  }

  if (SEALEVEL_STANDARDS_REQUIRING_COLLATERAL.has(standard) && !collateralAddressOrDenom) {
    return res.status(400).json({ error: 'Missing collateral address' });
  }

  try {
    const { chains, warpRouteConfigs } = await getRegistryData();
    const chain = chains[chainName];
    if (!chain || chain.protocol !== 'sealevel') {
      return res.status(400).json({ error: 'Unsupported chain' });
    }

    if (
      !isRegisteredTokenRequest(warpRouteConfigs, {
        chainName,
        addressOrDenom,
        collateralAddressOrDenom,
        standard,
      })
    ) {
      return res.status(400).json({ error: 'Unknown warp route token' });
    }

    const multiProvider = getMultiProvider(chainName, chain);
    const adapter = createSealevelHypAdapter(multiProvider, {
      chainName,
      addressOrDenom,
      collateralAddressOrDenom,
      standard,
    });
    if (!adapter) {
      return res.status(400).json({ error: 'Unsupported token' });
    }

    const balance = await adapter.getBridgedSupply();
    if (balance === undefined) {
      return res.status(404).json({ error: 'Balance unavailable' });
    }

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ balance: balance.toString() });
  } catch (error) {
    if (isMissingBalanceAccountError(error)) {
      logger.debug('sealevel-warp-route-balance missing balance account', {
        chainName,
        addressOrDenom,
        standard,
      });
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({ balance: '0' });
    }

    logger.error('sealevel-warp-route-balance failed', error);
    return res.status(500).json({ error: 'Failed to fetch balance' });
  }
}
