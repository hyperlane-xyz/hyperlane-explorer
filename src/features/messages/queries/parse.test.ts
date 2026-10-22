import { createChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';

import { MessageStatus } from '../../../types';
import type { MessageEntry } from './fragments';
import {
  parseBlockNumber,
  parseMessageEntry,
  parseMessageQueryResult,
  parseMessageStubResult,
} from './parse';

const resolver = createChainMetadataResolver({});
// Near-head rows may lack the transaction enrichment present in canonical rows.
const row = {
  id: '1',
  msg_id: '\\x01',
  nonce: 1,
  sender: '\\x02',
  recipient: '\\x03',
  origin_domain_id: 1,
  destination_domain_id: 10,
  is_delivered: false,
  is_provisional: true,
  origin_block_height: '100',
  origin_block_hash: '\\x04',
  origin_mailbox: '\\x05',
  origin_tx_hash: '\\x06',
  origin_tx_sender: null,
  origin_tx_recipient: null,
  destination_tx_hash: null,
  delivery_occurred_at: null,
  message_body: null,
  total_gas_amount: 0,
  total_payment: 0,
  num_payments: 0,
  send_occurred_at: '2026-10-22T12:00:00Z',
} as MessageEntry;

it('parses provisional rows and deliveries before transaction enrichment arrives', () => {
  const pending = parseMessageEntry(resolver, [], row);
  expect(pending).toMatchObject({
    status: MessageStatus.Pending,
    isProvisional: true,
    body: '0x',
    origin: { blockNumber: 100, from: undefined, to: undefined },
  });
  const delivered = { ...row, is_delivered: true };
  expect(parseMessageEntry(resolver, [], delivered)).toMatchObject({
    status: MessageStatus.Delivered,
    destination: undefined,
  });
  expect(
    parseMessageEntry(resolver, [], {
      ...delivered,
      destination_tx_hash: '\\x07',
      delivery_occurred_at: '2026-10-22T12:01:00Z',
    })?.destination,
  ).toMatchObject({ hash: '0x07', blockNumber: undefined, from: undefined });
});

it('does not confuse a confirmed dispatch with a later provisional payment or delivery', () => {
  const parse = (canonical: MessageEntry[]) =>
    parseMessageQueryResult(resolver, [], {
      canonical,
      message_view: [row],
    })[0];
  expect(parse([row])).toMatchObject({ isProvisional: true, isOriginProvisional: false });
  expect(parse([]).isOriginProvisional).toBe(true);
  expect(parse([{ ...row, origin_block_hash: '\\xff' }]).isOriginProvisional).toBe(true);
  expect(
    parseMessageEntry(resolver, [], {
      ...row,
      is_provisional: false,
      live_confirmations: 0,
      live_received_at: 1,
    }),
  ).toMatchObject({ isProvisional: false, isOriginProvisional: false });
});

it('merges snapshots by message hash, tolerating ID collisions and partial query errors', () => {
  const canonical = { ...row, is_provisional: false };
  expect(parseMessageStubResult(resolver, [], { q0: [canonical], provisional: null })).toHaveLength(
    1,
  );
  const delivered = { ...row, is_delivered: true };
  const messages = parseMessageStubResult(resolver, [], {
    q0: [canonical],
    provisional: [delivered],
  });
  expect(messages).toHaveLength(1);
  expect(messages[0].status).toBe(MessageStatus.Delivered);
  expect(
    parseMessageStubResult(resolver, [], {
      q0: [canonical],
      provisional: [{ ...row, msg_id: '\\xff' }],
    }),
  ).toHaveLength(2);
});

it('accepts safe numeric or string block heights', () => {
  expect(parseBlockNumber(100)).toBe(100);
  expect(parseBlockNumber('100')).toBe(100);
  for (const invalid of ['-1', '1.5', '9007199254740992'])
    expect(parseBlockNumber(invalid)).toBeUndefined();
});
