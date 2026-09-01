import { getRelayTransactionError } from './transactionOutcome';

describe('getRelayTransactionError', () => {
  it('accepts a successful original transaction', () => {
    expect(getRelayTransactionError('success')).toBeUndefined();
  });

  it('accepts a successful repriced transaction', () => {
    expect(getRelayTransactionError('success', 'repriced')).toBeUndefined();
  });

  it('rejects a cancelled transaction', () => {
    expect(getRelayTransactionError('success', 'cancelled')?.message).toContain('cancelled');
  });

  it('rejects a semantically different replacement', () => {
    expect(getRelayTransactionError('success', 'replaced')?.message).toContain(
      'different transaction',
    );
  });

  it('rejects a reverted transaction', () => {
    expect(getRelayTransactionError('reverted')?.message).toContain('reverted');
  });
});
