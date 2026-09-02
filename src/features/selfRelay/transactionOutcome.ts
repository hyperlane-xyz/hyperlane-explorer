export type RelayReplacementReason = 'cancelled' | 'replaced' | 'repriced';

export function getRelayTransactionError(
  receiptStatus: 'reverted' | 'success',
  replacementReason?: RelayReplacementReason,
): Error | undefined {
  if (receiptStatus === 'reverted') return new Error('Relay transaction reverted');
  if (replacementReason === 'cancelled') return new Error('Relay transaction was cancelled');
  if (replacementReason === 'replaced') {
    return new Error('Relay transaction was replaced by a different transaction');
  }
  return undefined;
}
