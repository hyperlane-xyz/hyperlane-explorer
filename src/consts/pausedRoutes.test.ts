import { getMessagePause, getMessagePauseType } from './pausedRoutes';

describe('getMessagePauseType', () => {
  const pausedRoute = {
    originDomainId: 10,
    destinationDomainId: 8453,
    sender: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b',
    recipient: '0xba8cd87120aca631f59231f9fd6c5469bbee3440',
  };

  it('matches a paused route', () => {
    expect(getMessagePauseType(pausedRoute)).toBe('route');
  });

  it('matches another configured paused route', () => {
    expect(
      getMessagePauseType({
        originDomainId: 42161,
        destinationDomainId: 1399811149,
        sender: '0xef9295afcff293956e8b149b33449f246f6f107d',
        recipient: 'Ht37Rn665vxVD4mChW7Qf9r5MnGJQQwLAdfBZzpoKqTp',
      }),
    ).toBe('route');
  });

  it('matches a paused route in reverse', () => {
    expect(
      getMessagePauseType({
        originDomainId: pausedRoute.destinationDomainId,
        destinationDomainId: pausedRoute.originDomainId,
        sender: pausedRoute.recipient,
        recipient: pausedRoute.sender,
      }),
    ).toBe('route');
  });

  it('matches EVM addresses case-insensitively', () => {
    expect(
      getMessagePauseType({
        ...pausedRoute,
        sender: pausedRoute.sender.toUpperCase(),
        recipient: pausedRoute.recipient.toUpperCase(),
      }),
    ).toBe('route');
  });

  it('does not pause unrelated routes between the same chains', () => {
    expect(
      getMessagePauseType({
        ...pausedRoute,
        sender: '0x1111111111111111111111111111111111111111',
        recipient: '0x2222222222222222222222222222222222222222',
      }),
    ).toBeUndefined();
  });

  it('returns the configured link for a halted route', () => {
    expect(getMessagePause(pausedRoute)).toEqual({
      type: 'route',
      link: 'https://x.com/InfiniteTradePr/status/2090409024437039569',
    });
  });

  it('returns another configured route link', () => {
    expect(
      getMessagePause({
        originDomainId: 42161,
        destinationDomainId: 1399811149,
        sender: '0xef9295afcff293956e8b149b33449f246f6f107d',
        recipient: 'Ht37Rn665vxVD4mChW7Qf9r5MnGJQQwLAdfBZzpoKqTp',
      }),
    ).toEqual({
      type: 'route',
      link: 'https://x.com/nesaorg/status/2091915864497066077',
    });
  });

  it('does not pause route legs that exclude the halted chain', () => {
    expect(
      getMessagePauseType({
        originDomainId: 1,
        destinationDomainId: 8453,
        sender: '0xeec6574eabba52bac3f0277f2cd5ac7e67197886',
        recipient: '0x3eba6644819546c44eb3e7c3a92f034f921dca80',
      }),
    ).toBeUndefined();
  });
});
