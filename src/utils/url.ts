import type { ChainMetadata, ChainNameOrId } from '@hyperlane-xyz/sdk';
import { isZeroishAddress } from '@hyperlane-xyz/utils';

import type { ChainMetadataResolver } from '../features/chains/metadataManager';

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
  return appendToPath(baseUrl, `${urlPathStub}/${hash}`).toString();
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

  return appendToPath(baseUrl, `${urlPathStub}/${address}`).toString();
}

export async function tryGetBlockExplorerAddressUrl(
  chainMetadataResolver: ExplorerMetadataResolver,
  chain: ChainNameOrId,
  address: string,
) {
  return getBlockExplorerAddressUrl(chainMetadataResolver, chain, address);
}

function getExplorerBaseUrl(metadata: ChainMetadata, index = 0) {
  const explorer = metadata.blockExplorers?.[index];
  if (!explorer?.url) return null;
  return new URL(explorer.url).toString();
}

function appendToPath(baseUrl: string, pathExtension: string) {
  const base = new URL(baseUrl);
  let currentPath = base.pathname;
  if (currentPath.endsWith('/')) currentPath = currentPath.slice(0, -1);
  const newUrl = new URL(`${currentPath}/${pathExtension}`, base);
  newUrl.search = base.searchParams.toString();
  return newUrl;
}

function getExplorerAddressPathStub(metadata: ChainMetadata, address: string) {
  const family = metadata.blockExplorers?.[0]?.family;
  if (family === 'radixdashboard') {
    return address.startsWith('account') ? 'account' : 'component';
  }

  if (!family) return null;
  return family === 'voyager' ? 'contract' : 'address';
}

function isLegacyTransactionPath(chainName: string) {
  return ['nautilus', 'proteustestnet', 'radix', 'radixtestnet', 'aleo', 'aleotestnet'].includes(
    chainName,
  );
}
