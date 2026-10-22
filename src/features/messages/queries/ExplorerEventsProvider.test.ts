/** @jest-environment jsdom */

import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { LIVE_MESSAGE_LIMIT } from '../../../consts/api';
import { MessageStatus, type MessageStub } from '../../../types';
import {
  useConfirmationProgress,
  isWaitingForOriginConfirmations,
  getRequiredConfirmations,
  calculateConfirmationCount,
} from '../useConfirmationProgress';
import {
  ExplorerEventsProvider,
  parseExplorerEvent,
  partitionExplorerDomains,
} from './ExplorerEventsProvider';
import {
  useExplorerMessageRows,
  useIsMessageLive,
  useMessageRowSubscription,
} from './useLiveMessages';

const row = {
  id: '1',
  msg_id: '\\xab',
  nonce: 1,
  sender: '\\x01',
  recipient: '\\x02',
  origin_domain_id: 1,
  destination_domain_id: 10,
  is_delivered: false,
  origin_block_height: '100',
  origin_block_hash: '\\x03',
  origin_mailbox: '\\x04',
  origin_tx_hash: '\\x05',
  origin_tx_sender: null,
  origin_tx_recipient: null,
  total_gas_amount: '0',
  total_payment: '0',
  num_payments: '0',
  send_occurred_at: '2026-10-22T12:00:00Z',
};
const rollback = {
  type: 'rollback',
  confirmations: 0,
  domain: 1,
  fromHeight: '105',
  toHeight: '99',
};
const block = {
  type: 'block',
  domain: 1,
  height: '103',
  headHeight: '105',
  hash: `0x${'ab'.repeat(32)}`,
};
const refresh = jest.fn();
const snapshot = { originDomainId: 1, destinationDomainId: 10 } as MessageStub;
const resolver = {
  tryGetChainMetadata: () => ({ blocks: { confirmations: 2, reorgPeriod: 5 } }),
} as unknown as ChainMetadataResolver;
let renders = 0;
const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalWebSocket = global.WebSocket;
let sockets: FakeWebSocket[];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Probe() {
  renders++;
  const { messageRow } = useMessageRowSubscription('0xab', true, refresh, snapshot);
  const rows = useExplorerMessageRows();
  const message = {
    ...snapshot,
    isProvisional: messageRow?.is_provisional,
    status: messageRow?.is_delivered ? MessageStatus.Delivered : MessageStatus.Pending,
    origin: { blockNumber: Number(messageRow?.origin_block_height) },
  } as MessageStub;
  const progress = useConfirmationProgress(message, resolver);
  const waiting = isWaitingForOriginConfirmations(message, progress);
  const testnetLive = useIsMessageLive({
    originDomainId: 84532,
    destinationDomainId: 11155111,
  } as MessageStub);
  return createElement(
    'div',
    null,
    JSON.stringify({ messageRow, rows, progress, waiting, testnetLive }),
  );
}
const state = () => JSON.parse(container.textContent!);
const render = (domains = [1, 10]) =>
  act(async () => {
    root.render(createElement(ExplorerEventsProvider, { domains }, createElement(Probe)));
  });
function send(message: unknown, socket = sockets.at(-1)!) {
  socket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
}
const emit = (message: unknown, socket = sockets.at(-1)!) => act(async () => send(message, socket));

beforeEach(() => {
  testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  refresh.mockClear();
  sockets = [];
  container = document.createElement('div');
  root = createRoot(container);
  global.WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      sockets.push(this);
    }
  } as unknown as typeof WebSocket;
});
afterEach(async () => {
  await act(async () => root.unmount());
  global.WebSocket = originalWebSocket;
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
});

it('applies origin and destination reorgs even after the detail leaves the bounded buffer', async () => {
  await render();
  expect(new URL(sockets[0].url).searchParams.get('confirmations')).toBe('0');
  expect(new URL(sockets[0].url).searchParams.get('blocks')).toBe('true');
  await emit({ type: 'ready', customDomains: [1, 10] });
  await emit({ type: 'message_upsert', confirmations: 0, data: row });
  expect(state().progress.current).toBeNull();
  await emit({ ...block, headHeight: '103' });
  expect(state().progress.current).toBe(3);
  expect(state().waiting).toBe(true);
  await emit(block);
  expect(state().progress.current).toBe(5);
  expect(state().waiting).toBe(false);
  const cappedRenders = renders;
  await emit({ ...block, headHeight: '106' });
  expect(renders).toBe(cappedRenders);
  await emit({ ...block, headHeight: '103' });
  expect(state().progress.current).toBe(3);
  await emit({
    type: 'message_upsert',
    confirmations: 0,
    data: {
      ...row,
      is_delivered: true,
      destination_block_height: null,
      destination_tx_hash: '\\x06',
      destination_tx_gas_used: 21000,
    },
  });
  expect(state().progress.current).toBe(3);
  expect(state().waiting).toBe(false);
  expect(state().messageRow.is_provisional).toBe(true);
  await emit({ ...rollback, domain: 10 });
  expect(state().messageRow.is_delivered).toBe(true);
  await emit({
    type: 'message_upsert',
    confirmations: 0,
    data: {
      ...state().messageRow,
      destination_block_height: 105,
    },
  });
  await act(async () => {
    for (let i = 0; i < LIVE_MESSAGE_LIMIT; i++)
      send({
        type: 'message_upsert',
        data: { ...row, msg_id: `\\xother${i}`, origin_domain_id: 173, destination_domain_id: 56 },
      });
  });
  expect(state().rows).toHaveLength(LIVE_MESSAGE_LIMIT);
  expect(state().messageRow.msg_id).toBe(row.msg_id);
  await emit({ ...rollback, domain: 173 });
  expect(state().messageRow.is_delivered).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(2);
  await emit({ ...rollback, domain: 10, toHeight: '104' });
  expect(state().messageRow).toMatchObject({
    is_delivered: false,
    destination_tx_hash: null,
    destination_tx_gas_used: null,
  });
  await emit(rollback);
  expect(state().messageRow).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(4);
});

it('refreshes snapshot-only details only on their affected chains', async () => {
  await render();
  await emit({ type: 'ready' });
  await emit({ ...rollback, domain: 173 });
  expect(refresh).toHaveBeenCalledTimes(1);
  await emit(rollback);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('clears disconnected state, ignores stale frames, and refreshes after reconnecting', async () => {
  await render();
  await emit({ type: 'ready' });
  await emit({ type: 'message_upsert', data: row });
  await emit(block);
  const previous = sockets[0];
  await act(async () => previous.close());
  await emit({ type: 'message_upsert', data: row }, previous);
  await emit({ type: 'ready' }, previous);
  expect(state().messageRow).toBeNull();
  expect(state().progress).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(sockets).toHaveLength(2);
  await emit({ type: 'ready' });
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('keeps healthy hidden tabs connected and falls back after a rejected negotiation', async () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await render();
  await act(async () => jest.advanceTimersByTime(65000));
  expect(sockets[0].closed).toBe(false);
  visibility.mockReturnValue('visible');
  await act(async () => jest.advanceTimersByTime(65000));
  expect(sockets[0].closed).toBe(true);
  await act(async () => jest.advanceTimersByTime(1000));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await act(async () =>
    sockets[1].onclose?.(
      new CloseEvent('close', {
        code: 1008,
        reason: 'Maximum connections per client reached',
      }),
    ),
  );
  await act(async () => jest.advanceTimersByTime(2000));
  expect(sockets).toHaveLength(3);
  await act(async () =>
    sockets[2].onclose?.(
      new CloseEvent('close', {
        code: 1008,
        reason: 'Invalid subscription',
      }),
    ),
  );
  await act(async () => jest.advanceTimersByTime(130000));
  expect(sockets).toHaveLength(3);
});

it('keeps equivalent subscriptions stable and respects negotiated chain coverage', async () => {
  await render();
  await emit({ type: 'ready', customDomains: [] });
  await emit({ type: 'message_upsert', confirmations: 0, data: row });
  expect(state().messageRow.is_provisional).toBe(false);
  expect(state().messageRow.live_confirmations).toBeUndefined();
  expect(state().testnetLive).toBe(false);
  await render([10, 1]);
  expect(sockets).toHaveLength(1);
  await emit({ type: 'ready', customDomains: [1] });
  await emit({ type: 'message_upsert', confirmations: 0, data: row });
  expect(state().messageRow.live_confirmations).toBe(0);
  await render([84532]);
  await emit({ type: 'ready', customDomains: [84532] });
  expect(state().testnetLive).toBe(true);
});

it('validates wire data while accepting partial transaction enrichment', () => {
  expect(
    parseExplorerEvent(JSON.stringify({ type: 'message_upsert', confirmations: 0, data: row })),
  ).toEqual({ type: 'message_upsert', confirmations: 0, data: row });
  expect(parseExplorerEvent(JSON.stringify(block))).toEqual(block);
  expect(parseExplorerEvent(JSON.stringify(rollback))).toEqual(rollback);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const invalid of [
    { ...block, headHeight: '9007199254740993' },
    { ...block, headHeight: '102' },
    { ...block, hash: '0xabc' },
    { ...rollback, confirmations: 1 },
    { ...rollback, toHeight: '106' },
    { type: 'message_upsert', data: {} },
    { type: 'message_upsert', data: { ...row, origin_block_height: '-1' } },
  ])
    expect(parseExplorerEvent(JSON.stringify(invalid))).toBeNull();
  expect(partitionExplorerDomains([10, -1, 10, Number.NaN])).toEqual({
    domainIds: [10, 0xffffffff],
    invalidDomainIds: [Number.NaN],
  });
});

it('keeps unknown heads and finality tags unknown, with numeric reorg thresholds', () => {
  expect(calculateConfirmationCount(100, undefined, 5)).toBeNull();
  expect(calculateConfirmationCount(100, 99, 5)).toBe(0);
  expect(getRequiredConfirmations({ confirmations: 2, reorgPeriod: 10 })).toBe(10);
  expect(getRequiredConfirmations({ confirmations: 2 })).toBe(2);
  for (const reorgPeriod of ['safe', 'finalized'])
    expect(getRequiredConfirmations({ confirmations: 2, reorgPeriod })).toBeUndefined();
  const message = { status: MessageStatus.Pending, isProvisional: true };
  expect(isWaitingForOriginConfirmations(message)).toBe(true);
  expect(isWaitingForOriginConfirmations({ ...message, isOriginProvisional: false })).toBe(false);
});

class FakeWebSocket {
  closed = false;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
    this.onclose?.(new CloseEvent('close'));
  }
}
