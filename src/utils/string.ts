// TODO add unit tests
import { strip0x } from '@hyperlane-xyz/utils';

// Only allows letters and numbers
const alphanumericRgex = /[^a-zA-Z0-9]/gi;
export function sanitizeString(str: string) {
  if (!str || typeof str !== 'string') return '';
  return str.replaceAll(alphanumericRgex, '');
}

export function tryUtf8DecodeBytes(value: string, fatal = true) {
  if (!value) return undefined;
  try {
    const decoder = new TextDecoder('utf-8', { fatal });
    return decoder.decode(Buffer.from(strip0x(value), 'hex'));
  } catch {
    return undefined;
  }
}

export function truncateString(str: string, startChars = 15, endChars = 15) {
  if (!str || str.length <= startChars + endChars + 3) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}
