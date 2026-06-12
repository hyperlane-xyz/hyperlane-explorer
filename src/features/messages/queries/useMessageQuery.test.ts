import { MessageStatus, MessageStub } from '../../../types';
import { messageMatchesWarpRoute } from './useMessageQuery';

const ORIGIN_DOMAIN = 1;
const DEST_DOMAIN = 10;
const ROUTER_A = '0x' + '11'.repeat(20);
const ROUTER_B = '0x' + '22'.repeat(20);
const OTHER = '0x' + '33'.repeat(20);

function makeStub(overrides: Partial<MessageStub> = {}): MessageStub {
  return {
    status: MessageStatus.Delivered,
    id: 'db-id',
    msgId: '0x' + 'ab'.repeat(32),
    nonce: 0,
    sender: ROUTER_A,
    recipient: ROUTER_B,
    originChainId: 1,
    originDomainId: ORIGIN_DOMAIN,
    destinationChainId: 10,
    destinationDomainId: DEST_DOMAIN,
    origin: { hash: '0x' + '00'.repeat(32), from: OTHER, to: ROUTER_A, timestamp: 0 },
    body: '0x',
    ...overrides,
  };
}

describe('messageMatchesWarpRoute', () => {
  it('matches when sender equals route address on the origin domain', () => {
    const message = makeStub({ sender: ROUTER_A, recipient: OTHER });
    expect(messageMatchesWarpRoute(message, [{ domainId: ORIGIN_DOMAIN, address: ROUTER_A }])).toBe(
      true,
    );
  });

  it('matches when recipient equals route address on the destination domain', () => {
    const message = makeStub({ sender: OTHER, recipient: ROUTER_B });
    expect(messageMatchesWarpRoute(message, [{ domainId: DEST_DOMAIN, address: ROUTER_B }])).toBe(
      true,
    );
  });

  it('matches case-insensitively (checksummed vs lowercase)', () => {
    const message = makeStub({ sender: ROUTER_A.toUpperCase().replace('0X', '0x') });
    expect(messageMatchesWarpRoute(message, [{ domainId: ORIGIN_DOMAIN, address: ROUTER_A }])).toBe(
      true,
    );
  });

  it('excludes a route whose address matches but on the wrong chain', () => {
    // The DB filter matches on address bytes alone, so a route address that
    // coincides on another domain would leak in without the domain guard.
    const message = makeStub({ sender: ROUTER_A, recipient: OTHER });
    expect(messageMatchesWarpRoute(message, [{ domainId: DEST_DOMAIN, address: ROUTER_A }])).toBe(
      false,
    );
  });

  it('returns false when neither sender nor recipient matches', () => {
    const message = makeStub({ sender: OTHER, recipient: OTHER });
    expect(
      messageMatchesWarpRoute(message, [
        { domainId: ORIGIN_DOMAIN, address: ROUTER_A },
        { domainId: DEST_DOMAIN, address: ROUTER_B },
      ]),
    ).toBe(false);
  });

  it('returns false for an empty route list', () => {
    expect(messageMatchesWarpRoute(makeStub(), [])).toBe(false);
  });
});
