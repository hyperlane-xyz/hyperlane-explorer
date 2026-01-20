import { formatAmountCompact, formatAmountWithCommas } from './amount';

describe('formatAmountCompact', () => {
  it('returns original string for invalid numbers', () => {
    expect(formatAmountCompact('invalid')).toBe('invalid');
    expect(formatAmountCompact('')).toBe('');
  });

  it('returns 0 for zero', () => {
    expect(formatAmountCompact('0')).toBe('0');
    expect(formatAmountCompact('0.0')).toBe('0');
  });

  it('shows <0.0001 for dust amounts', () => {
    expect(formatAmountCompact('0.00000001')).toBe('<0.0001');
    expect(formatAmountCompact('0.00001')).toBe('<0.0001');
    expect(formatAmountCompact('9e-11')).toBe('<0.0001');
  });

  it('formats small amounts (0.0001 to 1) with up to 4 decimals', () => {
    expect(formatAmountCompact('0.0001')).toBe('0.0001');
    expect(formatAmountCompact('0.000123')).toBe('0.0001');
    expect(formatAmountCompact('0.001')).toBe('0.001');
    expect(formatAmountCompact('0.9999')).toBe('0.9999');
  });

  it('formats normal amounts (1-999) with exactly 2 decimals', () => {
    expect(formatAmountCompact('1')).toBe('1.00');
    expect(formatAmountCompact('1.5')).toBe('1.50');
    expect(formatAmountCompact('1.23456789')).toBe('1.23');
    expect(formatAmountCompact('999.99')).toBe('999.99');
    expect(formatAmountCompact('500.1000')).toBe('500.10');
  });

  it('formats thousands with K suffix', () => {
    expect(formatAmountCompact('1000')).toBe('1K');
    expect(formatAmountCompact('1234.56')).toBe('1.23K');
    expect(formatAmountCompact('12345.67')).toBe('12.35K');
    expect(formatAmountCompact('123456.78')).toBe('123.46K');
    expect(formatAmountCompact('999999')).toBe('1M');
  });

  it('formats millions with M suffix', () => {
    expect(formatAmountCompact('1000000')).toBe('1M');
    expect(formatAmountCompact('1234567.89')).toBe('1.23M');
    expect(formatAmountCompact('12345678.9')).toBe('12.35M');
    expect(formatAmountCompact('123456789')).toBe('123.46M');
  });

  it('formats billions with B suffix', () => {
    expect(formatAmountCompact('1000000000')).toBe('1B');
    expect(formatAmountCompact('1234567890')).toBe('1.23B');
    expect(formatAmountCompact('12345678901')).toBe('12.35B');
  });

  it('handles negative numbers', () => {
    expect(formatAmountCompact('-1234.56')).toBe('-1.23K');
    expect(formatAmountCompact('-1234567.89')).toBe('-1.23M');
  });

  it('trims trailing zeros for K/M/B suffixes', () => {
    expect(formatAmountCompact('1000.00')).toBe('1K');
    expect(formatAmountCompact('1500000')).toBe('1.5M');
  });
});

describe('formatAmountWithCommas', () => {
  it('returns original string for invalid numbers', () => {
    expect(formatAmountWithCommas('invalid')).toBe('invalid');
    expect(formatAmountWithCommas('')).toBe('');
  });

  it('formats integers with thousand separators', () => {
    expect(formatAmountWithCommas('1000')).toBe('1,000');
    expect(formatAmountWithCommas('100000')).toBe('100,000');
    expect(formatAmountWithCommas('1000000')).toBe('1,000,000');
    expect(formatAmountWithCommas('1234567890')).toBe('1,234,567,890');
  });

  it('formats decimals with thousand separators', () => {
    expect(formatAmountWithCommas('1234.56')).toBe('1,234.56');
    expect(formatAmountWithCommas('8820.7')).toBe('8,820.7');
    expect(formatAmountWithCommas('1234567.89')).toBe('1,234,567.89');
  });

  it('handles small numbers without commas', () => {
    expect(formatAmountWithCommas('999')).toBe('999');
    expect(formatAmountWithCommas('0.123456')).toBe('0.123456');
  });

  it('limits to 6 decimal places', () => {
    expect(formatAmountWithCommas('1.123456789')).toBe('1.123457');
  });
});
