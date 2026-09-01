import { type SelfRelayCandidateChecks, shouldCheckSelfRelay } from './eligibility';

const relayable: SelfRelayCandidateChecks = {
  isPending: true,
  hasNoKnownDeliveryError: true,
  isPiMessage: false,
  isPaused: false,
  hasDestinationConfig: true,
  hasSufficientCollateral: true,
  isOriginEvm: true,
  isDestinationEvm: true,
};

describe('shouldCheckSelfRelay', () => {
  it('checks pending EVM messages without known blockers', () => {
    expect(shouldCheckSelfRelay(relayable)).toBe(true);
  });

  it('does not check messages classified as failing', () => {
    expect(shouldCheckSelfRelay({ ...relayable, isPending: false })).toBe(false);
  });

  it('does not check messages with a known delivery error', () => {
    expect(shouldCheckSelfRelay({ ...relayable, hasNoKnownDeliveryError: false })).toBe(false);
  });

  it('does not check non-EVM messages', () => {
    expect(shouldCheckSelfRelay({ ...relayable, isDestinationEvm: false })).toBe(false);
  });
});
