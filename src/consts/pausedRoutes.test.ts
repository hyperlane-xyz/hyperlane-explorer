import { isRoutePaused } from './pausedRoutes';

describe('isRoutePaused', () => {
  const infiniteTradingProtocolRoute = {
    originDomainId: 10,
    destinationDomainId: 8453,
    sender: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b',
    recipient: '0xba8cd87120aca631f59231f9fd6c5469bbee3440',
  };

  it('matches a paused route', () => {
    expect(isRoutePaused(infiniteTradingProtocolRoute)).toBe(true);
  });

  it('matches the paused Nesa route', () => {
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
        originDomainId: infiniteTradingProtocolRoute.destinationDomainId,
        destinationDomainId: infiniteTradingProtocolRoute.originDomainId,
        sender: infiniteTradingProtocolRoute.recipient,
        recipient: infiniteTradingProtocolRoute.sender,
      }),
    ).toBe(true);
  });

  it('matches addresses case-insensitively', () => {
    expect(
      isRoutePaused({
        ...infiniteTradingProtocolRoute,
        sender: infiniteTradingProtocolRoute.sender.toUpperCase(),
        recipient: infiniteTradingProtocolRoute.recipient.toUpperCase(),
      }),
    ).toBe(true);
  });

  it('does not pause unrelated routes between the same chains', () => {
    expect(
      isRoutePaused({
        ...infiniteTradingProtocolRoute,
        sender: '0x1111111111111111111111111111111111111111',
        recipient: '0x2222222222222222222222222222222222222222',
      }),
    ).toBe(false);
  });
});
