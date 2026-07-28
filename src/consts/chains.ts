import {
  ChainTechnicalStack,
  ExplorerFamily,
  type ChainMetadata,
} from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { ProtocolType } from '@hyperlane-xyz/utils';

const cardanoNativeToken = { name: 'Cardano', symbol: 'ADA', decimals: 6 };

/**
 * Chains the explorer knows about even when the registry does not.
 *
 * These are merged *underneath* the registry, so a real registry entry always
 * wins. Cardano lives here because its Hyperlane deployment is scraped and
 * queryable before it has been published to the canonical registry — without
 * metadata the explorer cannot resolve a domain id to a chain, so its messages
 * would render as an unknown chain with unformatted addresses.
 *
 * Domain ids match `rust/main/agents/scraper/migration` and the Cardano agent
 * configs; Cardano has no EVM chain id, so `chainId` mirrors the domain.
 */
export const builtinChainMetadata: ChainMap<ChainMetadata> = {
  cardano: {
    name: 'cardano',
    displayName: 'Cardano',
    protocol: ProtocolType.Cardano,
    technicalStack: ChainTechnicalStack.Other,
    chainId: 2001,
    domainId: 2001,
    bech32Prefix: 'addr',
    nativeToken: cardanoNativeToken,
    rpcUrls: [{ http: 'https://cardano-mainnet.blockfrost.io/api/v0' }],
    blockExplorers: [
      {
        name: 'Cardanoscan',
        url: 'https://cardanoscan.io',
        apiUrl: 'https://cardanoscan.io',
        family: ExplorerFamily.Other,
      },
    ],
    blocks: { confirmations: 1, reorgPeriod: 5, estimateBlockTime: 20 },
  },
  cardanopreprod: {
    name: 'cardanopreprod',
    displayName: 'Cardano Preprod',
    protocol: ProtocolType.Cardano,
    technicalStack: ChainTechnicalStack.Other,
    chainId: 2002,
    domainId: 2002,
    bech32Prefix: 'addr_test',
    isTestnet: true,
    nativeToken: cardanoNativeToken,
    rpcUrls: [{ http: 'https://cardano-preprod.blockfrost.io/api/v0' }],
    blockExplorers: [
      {
        name: 'Cardanoscan',
        url: 'https://preprod.cardanoscan.io',
        apiUrl: 'https://preprod.cardanoscan.io',
        family: ExplorerFamily.Other,
      },
    ],
    blocks: { confirmations: 1, reorgPeriod: 5, estimateBlockTime: 20 },
  },
  cardanopreview: {
    name: 'cardanopreview',
    displayName: 'Cardano Preview',
    protocol: ProtocolType.Cardano,
    technicalStack: ChainTechnicalStack.Other,
    chainId: 2003,
    domainId: 2003,
    bech32Prefix: 'addr_test',
    isTestnet: true,
    nativeToken: cardanoNativeToken,
    rpcUrls: [{ http: 'https://cardano-preview.blockfrost.io/api/v0' }],
    blockExplorers: [
      {
        name: 'Cardanoscan',
        url: 'https://preview.cardanoscan.io',
        apiUrl: 'https://preview.cardanoscan.io',
        family: ExplorerFamily.Other,
      },
    ],
    blocks: { confirmations: 1, reorgPeriod: 5, estimateBlockTime: 20 },
  },
};
