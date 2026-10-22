/** @jest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub, type MessageTxStub } from '../../../types';
import type { MessageEntry } from './fragments';
import {
  filterLatestMessageRows,
  isExplorerMessageCovered,
  preserveMessageTransactionFields,
  useRetainedMessage,
} from './useLiveMessages';

it('only suppresses polling for messages covered by the negotiated domain filter', () => {
  const testnet = { originDomainId: 84532, destinationDomainId: 11155111 };
  expect(isExplorerMessageCovered([1, 10], testnet)).toBe(false);
  expect(isExplorerMessageCovered([84532], testnet)).toBe(true);
  expect(isExplorerMessageCovered([11155111], testnet)).toBe(true);
  expect(isExplorerMessageCovered([], testnet)).toBe(true);
  expect(isExplorerMessageCovered([1])).toBe(false);
});

describe('filterLatestMessageRows', () => {
  it('excludes a testnet upsert from a mainnet-scoped pending search', () => {
    const mainnet = {
      msg_id: '\\xmainnet',
      origin_domain_id: 1,
      destination_domain_id: 10,
      send_occurred_at: '2026-08-25T10:00:00Z',
    } as MessageEntry;
    const baseSepolia = {
      msg_id: '\\xtestnet',
      origin_domain_id: 84532,
      destination_domain_id: 11155111,
      send_occurred_at: '2026-08-25T11:00:00Z',
    } as MessageEntry;

    expect(filterLatestMessageRows([baseSepolia, mainnet], [1, 10])).toEqual([mainnet]);
  });
});

type Transaction = MessageTxStub & {
  blockHash?: string | null;
  gasLimit?: number | null;
  gasUsed?: number | null;
  nonce?: number | null;
};
type TestMessage = MessageStub & {
  origin: Transaction;
  destination?: Transaction;
  totalPayment?: string;
  numPayments?: number;
};

const transaction: Transaction = {
  hash: '0x01',
  from: '0x11',
  to: '0x22',
  timestamp: 100,
  blockNumber: 10,
  blockHash: '0xaa',
  gasLimit: 1000,
  gasUsed: 500,
  nonce: 5,
};
const enriched: TestMessage = {
  id: '1',
  msgId: '0xab',
  status: MessageStatus.Delivered,
  isProvisional: true,
  nonce: 1,
  sender: '0x33',
  recipient: '0x44',
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 2,
  destinationDomainId: 2,
  origin: transaction,
  destination: { ...transaction, hash: '0x02' },
  body: '0x',
  totalPayment: '100',
  numPayments: 1,
};
const partial: TestMessage = {
  ...enriched,
  origin: { hash: transaction.hash, timestamp: 100, gasLimit: null },
  destination: { hash: '0x02', timestamp: 100 },
};

it('retains missing transaction enrichment on both sides without mutating inputs', () => {
  const result = preserveMessageTransactionFields(partial, enriched);
  expect(result?.origin).toEqual(enriched.origin);
  expect(result?.destination).toEqual(enriched.destination);
  expect(partial.origin.from).toBeUndefined();
  expect(partial.origin.gasLimit).toBeNull();
});

it('prefers current values, including zero, and keeps message-level state authoritative', () => {
  const current = {
    ...partial,
    isProvisional: false,
    totalPayment: '0',
    numPayments: 0,
    origin: { ...partial.origin, from: '0x55', timestamp: 0, nonce: 0, gasUsed: 0 },
  };
  expect(preserveMessageTransactionFields(current, enriched)).toMatchObject({
    isProvisional: false,
    totalPayment: '0',
    numPayments: 0,
    origin: { from: '0x55', timestamp: 0, nonce: 0, gasUsed: 0, to: transaction.to },
  });
});

it.each([
  { msgId: '0xcd' },
  { originDomainId: 3, destinationDomainId: 4 },
  { originChainId: 3, destinationChainId: 4 },
  {
    origin: { ...partial.origin, hash: '0x03' },
    destination: { ...partial.destination, hash: '0x04', timestamp: 100 },
  },
  {
    origin: { ...partial.origin, blockNumber: 11 },
    destination: { hash: '0x02', timestamp: 100, blockNumber: 11 },
  },
  {
    origin: { ...partial.origin, blockHash: '0xbb' },
    destination: { hash: '0x02', timestamp: 100, blockHash: '0xbb' },
  },
])('does not carry enrichment across identity or block changes: %j', (change) => {
  const current = { ...partial, ...change };
  expect(preserveMessageTransactionFields(current, enriched)).toBe(current);
});

it('does not restore a rolled-back destination or a removed message', () => {
  const rollback = { ...partial, status: MessageStatus.Pending, destination: undefined };
  const result = preserveMessageTransactionFields(rollback, enriched);
  expect(result?.status).toBe(MessageStatus.Pending);
  expect(result?.destination).toBeUndefined();
  expect(result?.origin).toEqual(enriched.origin);
  expect(preserveMessageTransactionFields(null, enriched)).toBeNull();
});

it('keeps references stable when no enrichment is missing', () => {
  expect(preserveMessageTransactionFields(enriched, partial)).toBe(enriched);
  expect(preserveMessageTransactionFields(enriched, null)).toBe(enriched);
});

it('retains enrichment over consecutive updates and clears it on removal or navigation', async () => {
  const testGlobal: typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } = globalThis;
  testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  function View({ message }: { message: TestMessage | null }) {
    return createElement('div', null, JSON.stringify(useRetainedMessage(message)));
  }
  async function render(message: TestMessage | null) {
    await act(async () => root.render(createElement(View, { message })));
  }
  try {
    await render(enriched);
    await render(partial);
    expect(JSON.parse(container.textContent ?? '')).toEqual(enriched);
    await render({ ...partial, isProvisional: false });
    expect(JSON.parse(container.textContent ?? '')).toEqual({ ...enriched, isProvisional: false });
    await render({ ...partial, status: MessageStatus.Pending, destination: undefined });
    expect(JSON.parse(container.textContent ?? '')).not.toHaveProperty('destination');
    await render(null);
    expect(container.textContent).toBe('null');
    await render(partial);
    expect(JSON.parse(container.textContent ?? '')).toEqual(partial);
    await render(enriched);
    await render({ ...partial, msgId: '0xcd' });
    expect(JSON.parse(container.textContent ?? '')).toEqual({ ...partial, msgId: '0xcd' });
  } finally {
    await act(async () => root.unmount());
    delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});
