import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import {
  hexToBech32mPrefix,
  hexToRadixCustomPrefix,
  ProtocolType,
  strip0x,
} from '@hyperlane-xyz/utils';

export function formatAddress(
  address: string,
  domainId: number,
  multiProvider: MultiProtocolProvider,
) {
  const metadata = multiProvider.tryGetChainMetadata(domainId);

  switch (metadata?.protocol) {
    case ProtocolType.Radix:
      return hexToRadixCustomPrefix(address, 'component', metadata?.bech32Prefix, 30);
    case ProtocolType.Aleo:
      return address.split('/')[1];
    default:
      return address;
  }
}

export function formatTxHash(hash: string, domainId: number, multiProvider: MultiProtocolProvider) {
  const metadata = multiProvider.tryGetChainMetadata(domainId);

  switch (metadata?.protocol) {
    case ProtocolType.Radix:
      return hexToRadixCustomPrefix(hash, 'txid', metadata?.bech32Prefix);
    case ProtocolType.Cosmos:
      return strip0x(hash);
    case ProtocolType.CosmosNative:
      return strip0x(hash);
    case ProtocolType.Aleo:
      return hexToBech32mPrefix(hash, 'at');
    default:
      return hash;
  }
}
