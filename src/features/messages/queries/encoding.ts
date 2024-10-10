import { ChainMetadata } from '@hyperlane-xyz/sdk';
import {
  addressToByteHexString,
  bytesToProtocolAddress,
  ensure0x,
  isAddress,
  isAddressEvm,
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

export function addressToPostgresBytea(address: Address): string {
  const hexString = isAddressEvm(address) ? address : addressToByteHexString(address);
  return stringToPostgresBytea(hexString);
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

export function searchValueToPostgresBytea(input: string): string {
  if (isAddress(input)) return addressToPostgresBytea(input);
  else return stringToPostgresBytea(input);
}
