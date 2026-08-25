import { getRelativeTimeRefreshInterval } from './time';

describe('getRelativeTimeRefreshInterval', () => {
  const now = 24 * 60 * 60_000;

  it('refreshes only very recent timestamps every second', () => {
    expect(getRelativeTimeRefreshInterval(now - 30_000, now)).toBe(1_000);
    expect(getRelativeTimeRefreshInterval(now - 5 * 60_000, now)).toBe(60_000);
  });

  it('slows hourly timestamps and stops refreshing date-only values', () => {
    expect(getRelativeTimeRefreshInterval(now - 2 * 60 * 60_000, now)).toBe(60 * 60_000);
    expect(getRelativeTimeRefreshInterval(0, now)).toBeNull();
  });
});
