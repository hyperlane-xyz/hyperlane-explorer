import type { MessageEntry } from './fragments';
import { selectSubscribedMessageRow, shouldRefreshAfterReconnect } from './useLiveMessages';

describe('shouldRefreshAfterReconnect', () => {
  it('refreshes when the initial connection becomes ready', () => {
    expect(shouldRefreshAfterReconnect(true, 'connecting', 'connected')).toBe(true);
  });

  it('refreshes after reconnecting', () => {
    expect(shouldRefreshAfterReconnect(true, 'disconnected', 'connected')).toBe(true);
  });

  it('does not refresh disabled consumers', () => {
    expect(shouldRefreshAfterReconnect(false, 'disconnected', 'connected')).toBe(false);
  });
});

describe('selectSubscribedMessageRow', () => {
  it('retains a subscribed upsert after it leaves the bounded list overlay', () => {
    const delivered = { msg_id: '\\xabc' } as MessageEntry;

    expect(selectSubscribedMessageRow(null, delivered, '0xabc', 'connected')).toBe(delivered);
  });

  it('does not retain a row from a previous subscription', () => {
    const delivered = { msg_id: '\\xabc' } as MessageEntry;

    expect(selectSubscribedMessageRow(null, delivered, '0xdef', 'connected')).toBeNull();
  });

  it('drops a retained row while disconnected so GraphQL can become authoritative', () => {
    const pending = { msg_id: '\\xabc' } as MessageEntry;

    expect(selectSubscribedMessageRow(null, pending, '0xabc', 'disconnected')).toBeNull();
  });
});
