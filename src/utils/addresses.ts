import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import {
  bytesToProtocolAddress,
  fromHexString,
  hexToBech32mPrefix,
  hexToRadixCustomPrefix,
  isAddressTron,
  isZeroishAddress,
  ProtocolType,
  strip0x,
} from '@hyperlane-xyz/utils';

export function formatAddress(
  address: string,
  domainId: number,
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'>,
) {
  if (!address || isZeroishAddress(address)) return address;

  const metadata = chainMetadataResolver.tryGetChainMetadata(domainId);

  switch (metadata?.protocol) {
    case ProtocolType.Radix:
      return hexToRadixCustomPrefix(address, 'component', metadata?.bech32Prefix, 30);
    case ProtocolType.Tron:
      // Wire format is bytes32 hex; registry stores Tron token addresses as base58.
      // Convert so warp route lookups (endsWith match) and UI both use base58.
      if (isAddressTron(address)) return address;
      return bytesToProtocolAddress(fromHexString(address), ProtocolType.Tron);
    default:
      return address;
  }
}

export function formatTxHash(
  hash: string,
  domainId: number,
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'>,
) {
  if (!hash || /^0*$/.test(strip0x(hash))) return hash;

  const metadata = chainMetadataResolver.tryGetChainMetadata(domainId);

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
