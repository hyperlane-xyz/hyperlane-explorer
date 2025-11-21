import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { hexToRadixCustomPrefix, ProtocolType, strip0x } from '@hyperlane-xyz/utils';

export function formatAddress(
  address: string,
  domainId: number,
  multiProvider: MultiProtocolProvider,
) {
  const metadata = multiProvider.tryGetChainMetadata(domainId);
  if (metadata?.protocol === ProtocolType.Radix)
    return hexToRadixCustomPrefix(address, 'component', metadata?.bech32Prefix, 30);
  return address;
}

export function formatTxHash(hash: string, domainId: number, multiProvider: MultiProtocolProvider) {
  const metadata = multiProvider.tryGetChainMetadata(domainId);

  switch (metadata?.protocol) {
    case ProtocolType.Radix:
      return hexToRadixCustomPrefix(hash, 'txid', metadata?.bech32Prefix);
    case ProtocolType.Cosmos:
      return strip0x(hash);
    default:
      return hash;
  }
}
