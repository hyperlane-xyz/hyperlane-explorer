import { shouldRefreshForReadyState } from './useLiveMessages';

describe('shouldRefreshForReadyState', () => {
  it('does not refresh when the initial connection becomes ready', () => {
    expect(shouldRefreshForReadyState(true, 1, 0, false)).toBe(false);
  });

  it('refreshes consumers mounted after the connection is ready', () => {
    expect(shouldRefreshForReadyState(true, 1, 1, true)).toBe(true);
  });

  it('refreshes after reconnecting', () => {
    expect(shouldRefreshForReadyState(true, 2, 1, false)).toBe(true);
  });

  it('does not refresh disabled consumers', () => {
    expect(shouldRefreshForReadyState(false, 2, 1, false)).toBe(false);
  });
});
