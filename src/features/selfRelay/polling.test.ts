import { SelfRelayPrepareError, getSelfRelayRefetchInterval } from './polling';

describe('getSelfRelayRefetchInterval', () => {
  it('backs off and bounds metadata-not-ready checks', () => {
    const error = new SelfRelayPrepareError('Metadata not ready', 409);

    expect(getSelfRelayRefetchInterval(error, 1)).toBe(30_000);
    expect(getSelfRelayRefetchInterval(error, 2)).toBe(60_000);
    expect(getSelfRelayRefetchInterval(error, 3)).toBe(false);
  });

  it.each([400, 404, 422, 429, 500])('does not repeat permanent HTTP %i failures', (status) => {
    expect(getSelfRelayRefetchInterval(new SelfRelayPrepareError('Unavailable', status), 1)).toBe(
      false,
    );
  });
});
