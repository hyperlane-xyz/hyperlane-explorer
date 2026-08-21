import { MessageStatus, MessageStub } from '../../../types';
import { adjustToUtcTime } from '../../../utils/time';
import { MessageIdentifierType, buildMessageQuery, buildMessageSearchQuery } from './build';
import {
  getSearchMetadataState,
  messageMatchesSearchFilters,
  messageMatchesWarpRoute,
  shouldUseMessageQueryCache,
} from './useMessageQuery';

const ORIGIN_DOMAIN = 1;
const DEST_DOMAIN = 10;
const ROUTER_A = '0x' + '11'.repeat(20);
const ROUTER_B = '0x' + '22'.repeat(20);
const OTHER = '0x' + '33'.repeat(20);
// Alpha hex digits so upper/lower casing actually differ — needed to exercise
// case-insensitive address comparison.
const ROUTER_MIXED = '0x' + 'ab'.repeat(20);

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

  it('matches case-insensitively (uppercase sender vs lowercase route address)', () => {
    const message = makeStub({ sender: '0x' + 'AB'.repeat(20) });
    expect(
      messageMatchesWarpRoute(message, [{ domainId: ORIGIN_DOMAIN, address: ROUTER_MIXED }]),
    ).toBe(true);
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

describe('messageMatchesSearchFilters', () => {
  const noFilters = {
    searchInput: '',
    originDomainId: null,
    destinationDomainId: null,
    startTime: null,
    endTime: null,
    status: 'all' as const,
  };

  it('matches origin and destination domains', () => {
    expect(
      messageMatchesSearchFilters(makeStub(), {
        ...noFilters,
        originDomainId: ORIGIN_DOMAIN,
        destinationDomainId: DEST_DOMAIN,
      }),
    ).toBe(true);
    expect(messageMatchesSearchFilters(makeStub(), { ...noFilters, originDomainId: 999 })).toBe(
      false,
    );
  });

  it('matches the inclusive adjusted time range used by GraphQL', () => {
    const startTime = Date.now() - 60_000;
    const endTime = Date.now() + 60_000;
    const timestamp = Date.parse(adjustToUtcTime(Date.now()));
    const message = makeStub({ origin: { ...makeStub().origin, timestamp } });

    expect(messageMatchesSearchFilters(message, { ...noFilters, startTime, endTime })).toBe(true);
    expect(messageMatchesSearchFilters(message, { ...noFilters, startTime: endTime })).toBe(false);
  });

  it('matches delivery status', () => {
    expect(messageMatchesSearchFilters(makeStub(), { ...noFilters, status: 'delivered' })).toBe(
      true,
    );
    expect(messageMatchesSearchFilters(makeStub(), { ...noFilters, status: 'pending' })).toBe(
      false,
    );
  });

  it('matches message, transaction, and address searches', () => {
    const message = makeStub();
    expect(messageMatchesSearchFilters(message, { ...noFilters, searchInput: message.msgId })).toBe(
      true,
    );
    expect(
      messageMatchesSearchFilters(message, { ...noFilters, searchInput: message.origin.hash }),
    ).toBe(true);
    expect(
      messageMatchesSearchFilters(message, { ...noFilters, searchInput: message.sender }),
    ).toBe(true);
    expect(
      messageMatchesSearchFilters(message, { ...noFilters, searchInput: '0x' + 'ff'.repeat(32) }),
    ).toBe(false);
  });
});

describe('message query caching', () => {
  it('caches by default', () => {
    expect(buildMessageQuery(MessageIdentifierType.Id, '0x01', 1).query).toContain('@cached');
    expect(buildMessageSearchQuery('', null, null, null, null, 1).query).toContain('@cached');
  });

  it('can be disabled for live queries', () => {
    expect(
      buildMessageQuery(MessageIdentifierType.Id, '0x01', 1, false, undefined, { cached: false })
        .query,
    ).not.toContain('@cached');
    expect(
      buildMessageSearchQuery('', null, null, null, null, 1, false, [], 'all', [], false, {
        cached: false,
      }).query,
    ).not.toContain('@cached');
  });

  it('only bypasses server caching while live updates are connected', () => {
    expect(shouldUseMessageQueryCache('connected')).toBe(false);
    expect(shouldUseMessageQueryCache('connecting')).toBe(true);
    expect(shouldUseMessageQueryCache('disconnected')).toBe(true);
    expect(shouldUseMessageQueryCache('unavailable')).toBe(true);
  });
});

describe('search metadata readiness', () => {
  it('propagates metadata query errors without leaving the search loading', () => {
    expect(getSearchMetadataState(0, 0, false, true)).toEqual({
      isReady: false,
      isError: true,
    });
  });

  it('treats a completed empty domains response as an error', () => {
    expect(getSearchMetadataState(0, 0, false, false)).toEqual({
      isReady: false,
      isError: true,
    });
  });
});
