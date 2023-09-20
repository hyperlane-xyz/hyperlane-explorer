import { ensure0x, strip0x } from '@hyperlane-xyz/utils';

export function stringToPostgresBytea(hexString: string) {
  const trimmed = strip0x(hexString).toLowerCase();
  const prefix = `\\x`;
  return `${prefix}${trimmed}`;
}

export function postgresByteaToString(byteString: string) {
  if (!byteString || byteString.length < 4) throw new Error('Invalid byte string');
  return ensure0x(byteString.substring(2));
}
