import type { ChainMetadata, ChainNameOrId } from '@hyperlane-xyz/sdk';
import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { convertToProtocolAddress, isZeroishAddress, ProtocolType } from '@hyperlane-xyz/utils';

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

  const urlPathStub = isLegacyTransactionPath(metadata) ? 'transaction' : 'tx';
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
  const linkAddress = toExplorerAddress(metadata, address);
  const urlPathStub = getExplorerAddressPathStub(metadata, linkAddress);
  if (!baseUrl || !urlPathStub) return null;

  return appendToPath(baseUrl, `${urlPathStub}/${linkAddress}`)?.toString() || null;
}

// Tron warp-route entries are stored in the registry as EVM-shaped hex
// (`0x...`); Tronscan needs the base58 form (`T...`). Convert before linking.
function toExplorerAddress(metadata: ChainMetadata, address: string): string {
  if (metadata.protocol !== ProtocolType.Tron) return address;
  try {
    return convertToProtocolAddress(address, ProtocolType.Tron);
  } catch {
    return address;
  }
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
    // SPA hash routing (e.g. Tronscan: `https://tronscan.org/#/transaction/<hash>`).
    // `new URL` parses `#` as the fragment delimiter, so we'd otherwise drop the path
    // into the URL path instead of into the hash where Tronscan's router reads it.
    const hashIdx = baseUrl.indexOf('#');
    if (hashIdx !== -1) {
      const origin = baseUrl.slice(0, hashIdx);
      const hashContent = baseUrl.slice(hashIdx + 1).replace(/\/$/, '');
      return new URL(`${origin}#${hashContent}/${pathExtension}`);
    }

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

function isLegacyTransactionPath(metadata: ChainMetadata) {
  if (metadata.blockExplorers?.[0]?.family === 'tronscan') return true;
  return ['nautilus', 'proteustestnet', 'radix', 'radixtestnet', 'aleo', 'aleotestnet'].includes(
    metadata.name,
  );
}
