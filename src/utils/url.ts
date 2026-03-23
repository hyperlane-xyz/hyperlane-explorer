import type { ChainMetadata, ChainNameOrId } from '@hyperlane-xyz/sdk';
import { isZeroishAddress } from '@hyperlane-xyz/utils';

import type { ChainMetadataResolver } from '../features/chains/metadataManager';
import { logger } from './logger';

type ExplorerMetadataResolver = Pick<ChainMetadataResolver, 'tryGetChainMetadata'>;

export function getBlockExplorerTxUrl(
  chainMetadataResolver: ExplorerMetadataResolver,
  chain: ChainNameOrId,
  hash: string,
) {
  const metadata = chainMetadataResolver.tryGetChainMetadata(chain);
  if (!metadata || !hash) return null;
  const baseUrl = getExplorerBaseUrl(metadata);
  if (!baseUrl) return null;

  const urlPathStub = isLegacyTransactionPath(metadata.name) ? 'transaction' : 'tx';
  return appendToPath(baseUrl, `${urlPathStub}/${hash}`)?.toString() || null;
}

export function getBlockExplorerAddressUrl(
  chainMetadataResolver: ExplorerMetadataResolver,
  chain: ChainNameOrId,
  address: string,
) {
  if (!address || isZeroishAddress(address)) return null;

  const metadata = chainMetadataResolver.tryGetChainMetadata(chain);
  if (!metadata) return null;

  const baseUrl = getExplorerBaseUrl(metadata);
  const urlPathStub = getExplorerAddressPathStub(metadata, address);
  if (!baseUrl || !urlPathStub) return null;

  return appendToPath(baseUrl, `${urlPathStub}/${address}`)?.toString() || null;
}

export function tryGetBlockExplorerAddressUrl(
  chainMetadataResolver: ExplorerMetadataResolver,
  chain: ChainNameOrId,
  address: string,
) {
  return Promise.resolve(getBlockExplorerAddressUrl(chainMetadataResolver, chain, address));
}

function getExplorerBaseUrl(metadata: ChainMetadata, index = 0) {
  const explorer = metadata.blockExplorers?.[index];
  if (!explorer?.url) return null;
  try {
    return new URL(explorer.url).toString();
  } catch (error) {
    logger.debug('Invalid block explorer URL', metadata.name, explorer.url, error);
    return null;
  }
}

function appendToPath(baseUrl: string, pathExtension: string) {
  try {
    const base = new URL(baseUrl);
    let currentPath = base.pathname;
    if (currentPath.endsWith('/')) currentPath = currentPath.slice(0, -1);
    const newUrl = new URL(`${currentPath}/${pathExtension}`, base);
    newUrl.search = base.searchParams.toString();
    return newUrl;
  } catch (error) {
    logger.debug('Error appending block explorer path', baseUrl, pathExtension, error);
    return null;
  }
}

function getExplorerAddressPathStub(metadata: ChainMetadata, address: string) {
  const family = metadata.blockExplorers?.[0]?.family;
  if (!family) return null;
  if (family === 'radixdashboard') {
    return address.startsWith('account') ? 'account' : 'component';
  }
  return family === 'voyager' ? 'contract' : 'address';
}

function isLegacyTransactionPath(chainName: string) {
  return ['nautilus', 'proteustestnet', 'radix', 'radixtestnet', 'aleo', 'aleotestnet'].includes(
    chainName,
  );
}
