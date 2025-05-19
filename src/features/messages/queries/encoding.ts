import { ChainMetadata } from '@hyperlane-xyz/sdk';
import {
  addressToByteHexString,
  base58ToBuffer,
  bufferToBase58,
  bytesToProtocolAddress,
  ensure0x,
  getAddressProtocolType,
  isAddressEvm,
  isValidTransactionHashCosmos,
  isValidTransactionHashEvm,
  isValidTransactionHashSealevel,
  isValidTransactionHashStarknet,
  ProtocolType,
  strip0x,
} from '@hyperlane-xyz/utils';

export function stringToPostgresBytea(hexString: string): string {
  const trimmed = strip0x(hexString).toLowerCase();
  const prefix = `\\x`;
  return `${prefix}${trimmed}`;
}

export function postgresByteaToString(byteString: string): string {
  if (!byteString || byteString.length < 4) throw new Error('Invalid byte string');
  return ensure0x(byteString.substring(2));
}

export function postgresByteaToAddress(
  byteString: string,
  chainMetadata: ChainMetadata | null | undefined,
): Address {
  const hexString = postgresByteaToString(byteString);
  if (!chainMetadata) return hexString;
  const addressBytes = Buffer.from(strip0x(hexString), 'hex');
  return bytesToProtocolAddress(addressBytes, chainMetadata.protocol, chainMetadata.bech32Prefix);
}

export function postgresByteaToTxHash(
  byteString: string,
  chainMetadata: ChainMetadata | null | undefined,
): string {
  const hexString = postgresByteaToString(byteString);
  // Return hex string for protocols other than Sealevel
  if (chainMetadata?.protocol !== ProtocolType.Sealevel) return hexString;
  const bytes = Buffer.from(strip0x(hexString), 'hex');
  return bufferToBase58(bytes);
}

export function isSearchableAddress(input: string): boolean {
  const addressProtocolType = getAddressProtocolType(input);
  return addressProtocolType !== undefined && addressProtocolType !== ProtocolType.Starknet;
}

export function searchValueToPostgresBytea(input: string): string | undefined {
  if (!input) return undefined;
  try {
    // EVM addresses are always searchable
    if (isAddressEvm(input)) {
      return stringToPostgresBytea(input);
    }
    // Non-EVM addresses are only searchable if they're not Starknet
    // We also have to convert to hex string to match the DB encoding
    if (isSearchableAddress(input)) {
      return stringToPostgresBytea(addressToByteHexString(input));
    }
    // Otherwise check if it's a tx hash
    if (
      isValidTransactionHashEvm(input) ||
      isValidTransactionHashCosmos(input) ||
      isValidTransactionHashStarknet(input)
    ) {
      return stringToPostgresBytea(input);
    }
    // Have to adjust sealevel tx hash to match the DB encoding
    if (isValidTransactionHashSealevel(input)) {
      const bytes = base58ToBuffer(input);
      return stringToPostgresBytea(bytes.toString('hex'));
    }
    return undefined;
  } catch {
    // Search input couldn't be decoded and recoded properly
    return undefined;
  }
}
