import { shouldRefreshAfterReconnect } from './useLiveMessages';

describe('shouldRefreshAfterReconnect', () => {
  it('does not refresh when the initial connection becomes ready', () => {
    expect(shouldRefreshAfterReconnect(true, 'connecting', 'connected')).toBe(false);
  });

  it('refreshes after reconnecting', () => {
    expect(shouldRefreshAfterReconnect(true, 'disconnected', 'connected')).toBe(true);
  });

  it('does not refresh disabled consumers', () => {
    expect(shouldRefreshAfterReconnect(false, 'disconnected', 'connected')).toBe(false);
  });
});
