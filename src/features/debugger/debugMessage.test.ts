import { extractReasonString } from './debugMessage';

// Regression test for https://github.com/hyperlane-xyz/hyperlane-explorer/issues/151
//
// Treasure (a ZKSync-based chain) rejects eth_estimateGas with a generic node/RPC
// error that carries no ethers `reason="..."`. Previously the whole chain was
// blacklisted via `debugIgnoredChains`, which silently hid both those estimation
// quirks and every genuine delivery failure. The fix distinguishes a real contract
// revert (has a reason) from an unverifiable estimation error (no reason) via the
// `isKnownRevert` flag, so the latter is surfaced to the user instead of swallowed.
describe('extractReasonString', () => {
  it('flags a genuine ethers revert as known', () => {
    const err = new Error('execution reverted: reason="Insufficient gas"');
    const { reason, isKnownRevert } = extractReasonString(err);
    expect(isKnownRevert).toBe(true);
    expect(reason).toContain('Insufficient gas');
  });

  it('flags a generic ZKSync-style estimation error as unknown', () => {
    // Treasure/zksync return errors like this from estimateGas — no `reason=` field.
    const err = new Error(
      'missing revert data in call exception; Transaction reverted without a reason string',
    );
    const { reason, isKnownRevert } = extractReasonString(err);
    expect(isKnownRevert).toBe(false);
    // still returns a human-readable string, just not treated as a known revert
    expect(reason.startsWith('Failure reason:')).toBe(true);
  });

  it('never throws on an error with no message', () => {
    const { reason, isKnownRevert } = extractReasonString(new Error(''));
    expect(isKnownRevert).toBe(false);
    expect(typeof reason).toBe('string');
  });
});
