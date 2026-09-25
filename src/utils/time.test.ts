import { getRelativeTimeRefreshInterval } from './time';

describe('getRelativeTimeRefreshInterval', () => {
  const now = 24 * 60 * 60_000;

  it('aligns refreshes to the next second or minute boundary', () => {
    expect(getRelativeTimeRefreshInterval(now - 30_000, now)).toBe(1_000);
    expect(getRelativeTimeRefreshInterval(now - 30_500, now)).toBe(500);
    expect(getRelativeTimeRefreshInterval(now - 5 * 60_000 - 15_000, now)).toBe(45_000);
  });

  it('aligns hourly refreshes and stops refreshing date-only values', () => {
    expect(getRelativeTimeRefreshInterval(now - 2 * 60 * 60_000 - 15_000, now)).toBe(
      60 * 60_000 - 15_000,
    );
    expect(getRelativeTimeRefreshInterval(0, now)).toBeNull();
  });
});
