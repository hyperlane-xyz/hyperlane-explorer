import { isRoutePaused } from './pausedRoutes';

describe('isRoutePaused', () => {
  const pausedRoute = {
    originDomainId: 10,
    destinationDomainId: 8453,
    sender: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b',
    recipient: '0xba8cd87120aca631f59231f9fd6c5469bbee3440',
  };

  it('matches a paused route', () => {
    expect(isRoutePaused(pausedRoute)).toBe(true);
  });

  it('matches another configured paused route', () => {
    expect(
      isRoutePaused({
        originDomainId: 1,
        destinationDomainId: 41443,
        sender: '0x230f1e241c621d5af670dad83ebcdd18971e2995',
        recipient: '0xeec6574eabba52bac3f0277f2cd5ac7e67197886',
      }),
    ).toBe(true);
  });

  it('matches a paused route in reverse', () => {
    expect(
      isRoutePaused({
        originDomainId: pausedRoute.destinationDomainId,
        destinationDomainId: pausedRoute.originDomainId,
        sender: pausedRoute.recipient,
        recipient: pausedRoute.sender,
      }),
    ).toBe(true);
  });

  it('matches addresses case-insensitively', () => {
    expect(
      isRoutePaused({
        ...pausedRoute,
        sender: pausedRoute.sender.toUpperCase(),
        recipient: pausedRoute.recipient.toUpperCase(),
      }),
    ).toBe(true);
  });

  it('does not pause unrelated routes between the same chains', () => {
    expect(
      isRoutePaused({
        ...pausedRoute,
        sender: '0x1111111111111111111111111111111111111111',
        recipient: '0x2222222222222222222222222222222222222222',
      }),
    ).toBe(false);
  });
});
