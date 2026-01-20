/**
 * Format a token amount with abbreviations for large numbers.
 * Shows <0.0001 for dust amounts, up to 4 decimals for small amounts, K/M/B for large.
 *
 * Examples:
 *   0.00000001  → "<0.0001"
 *   0.000123    → "0.0001"
 *   0.001       → "0.001"
 *   1           → "1"
 *   1.5         → "1.50"
 *   999.99      → "999.99"
 *   1234.56     → "1.23K"
 *   1234567.89  → "1.23M"
 *   1234567890  → "1.23B"
 */
export function formatAmountCompact(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;

  const absNum = Math.abs(num);
  if (absNum === 0) return '0';
  if (absNum < 0.0001) return '<0.0001';
  if (absNum < 1) return num.toFixed(4).replace(/\.?0+$/, '');

  const isCompact = absNum >= 1_000;
  const isWholeNumber = Number.isInteger(num);

  return new Intl.NumberFormat('en-US', {
    notation: isCompact ? 'compact' : 'standard',
    minimumFractionDigits: isCompact || isWholeNumber ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a token amount with thousand separators (commas).
 * Preserves up to 6 decimal places, trims trailing zeros.
 *
 * Examples:
 *   100000      → "100,000"
 *   8820.7      → "8,820.7"
 *   1234567.89  → "1,234,567.89"
 */
export function formatAmountWithCommas(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
}
