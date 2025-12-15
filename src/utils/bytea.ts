/**
 * Shared utilities for PostgreSQL bytea <-> hex string conversion.
 * These are lightweight functions that work in both Node.js and Edge Runtime.
 */

/**
 * Convert a hex string to PostgreSQL bytea format.
 * Returns null if the input is invalid.
 */
export function stringToPostgresBytea(hexString: string): string | null {
  if (!hexString) return null;
  const trimmed = hexString.replace(/^0x/i, '').toLowerCase();
  // Validate: must be a valid hex string
  if (!/^[0-9a-f]+$/.test(trimmed)) return null;
  return `\\x${trimmed}`;
}

/**
 * Convert a PostgreSQL bytea string back to hex format (0x-prefixed).
 * Returns empty string if the input is invalid.
 */
export function postgresByteaToHex(byteString: string): string {
  if (!byteString || byteString.length < 4) return '';
  return '0x' + byteString.substring(2);
}
