import {
  MessageStatus,
  type MessageStub,
  type MessageTx,
  type MessageTxStub,
} from '../../../types';
import type { MessageEntry } from './fragments';
import { filterLatestMessageRows, preserveMessageTransactionFields } from './useLiveMessages';

it('excludes testnet messages from mainnet searches', () => {
  const mainnet = { origin_domain_id: 0xffffffff, destination_domain_id: 10 } as MessageEntry;
  const testnet = { origin_domain_id: 84532, destination_domain_id: 11155111 } as MessageEntry;
  expect(filterLatestMessageRows([testnet, mainnet], [-1, 10])).toEqual([mainnet]);
});

it('retains transaction enrichment, but never restores rolled-back delivery state', () => {
  const transaction = {
    hash: '0x01',
    timestamp: 100,
    blockNumber: 10,
    blockHash: '0xaa',
    gasUsed: 500,
  };
  const enriched: MessageStub & { origin: MessageTxStub & Partial<MessageTx> } = {
    id: '1',
    nonce: 1,
    sender: '0x01',
    recipient: '0x02',
    body: '0x',
    originChainId: 1,
    destinationChainId: 10,
    msgId: '0xab',
    originDomainId: 1,
    destinationDomainId: 10,
    status: MessageStatus.Delivered,
    origin: transaction,
    destination: transaction,
  };
  const partial: typeof enriched = {
    ...enriched,
    origin: { ...transaction, gasUsed: undefined },
    destination: undefined,
  };
  const result = preserveMessageTransactionFields(partial, enriched);
  expect(result?.origin.gasUsed).toBe(500);
  expect(result?.destination).toBeUndefined();
  expect(partial.origin.gasUsed).toBeUndefined();
  expect(
    preserveMessageTransactionFields(
      { ...enriched, origin: { ...transaction, gasUsed: 0 } },
      enriched,
    )?.origin.gasUsed,
  ).toBe(0);
  expect(preserveMessageTransactionFields(null, enriched)).toBeNull();
  for (const change of [
    { msgId: '0xcd' },
    { originDomainId: 2 },
    { originChainId: 2 },
    { origin: { ...partial.origin, hash: '0x02' } },
    { origin: { ...partial.origin, blockNumber: 11 } },
    { origin: { ...partial.origin, blockHash: '0xbb' } },
  ]) {
    const current = { ...partial, ...change };
    expect(preserveMessageTransactionFields(current, enriched)).toBe(current);
  }
});
