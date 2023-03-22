import { ensureLeading0x, trimLeading0x } from '../../../utils/addresses';

export function stringToPostgresBytea(hexString: string) {
  const trimmed = trimLeading0x(hexString).toLowerCase();
  const prefix = `\\x`;
  return `${prefix}${trimmed}`;
}

export function postgresByteaToString(byteString: string) {
  if (!byteString || byteString.length < 4) throw new Error('Invalid byte string');
  return ensureLeading0x(byteString.substring(2));
}
