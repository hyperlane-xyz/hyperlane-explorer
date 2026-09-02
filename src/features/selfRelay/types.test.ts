import { SelfRelayPrepareRequestSchema, SelfRelayPrepareResponseSchema } from './types';

const hash = `0x${'1'.repeat(64)}`;

describe('self-relay schemas', () => {
  it('accepts a valid prepare request', () => {
    expect(
      SelfRelayPrepareRequestSchema.safeParse({
        messageId: hash,
        originDomainId: 1,
        originTxHash: hash,
      }).success,
    ).toBe(true);
  });

  it('rejects malformed hashes', () => {
    expect(
      SelfRelayPrepareRequestSchema.safeParse({
        messageId: '0x1234',
        originDomainId: 1,
        originTxHash: hash,
      }).success,
    ).toBe(false);
  });

  it('accepts ready relay calldata', () => {
    expect(
      SelfRelayPrepareResponseSchema.safeParse({
        status: 'ready',
        destinationChainId: 10,
        destinationChainName: 'optimism',
        mailboxAddress: `0x${'2'.repeat(40)}`,
        calldata: '0x1234',
      }).success,
    ).toBe(true);
  });
});
