/**
 * Format a token amount with abbreviations for large numbers.
 * Small amounts show up to 2 decimals for normal amounts, 4 significant figures for small amounts.
 *
 * Examples:
 *   0.000123    → "0.0001234"
 *   1.5         → "1.5"
 *   999.99      → "999.99"
 *   1234.56     → "1.23K"
 *   1234567.89  → "1.23M"
 *   1234567890  → "1.23B"
 */
export function formatAmountCompact(amount: string): string {
  const num = parseFloat(amount);

  if (isNaN(num)) return amount;

  const absNum = Math.abs(num);

  if (absNum >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  }
  if (absNum >= 1_000_000) {
    return (num / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  }
  if (absNum >= 1_000) {
    return (num / 1_000).toFixed(2).replace(/\.?0+$/, '') + 'K';
  }
  if (absNum >= 1) {
    return num.toFixed(2).replace(/\.?0+$/, '');
  }
  if (absNum === 0) {
    return '0';
  }
  // Small amounts - show significant figures
  return num.toPrecision(4).replace(/\.?0+$/, '');
}
