import { createChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';

import { MessageStatus } from '../../../types';
import type { MessageEntry, MessageStubEntry } from './fragments';
import { parseMessageEntry, parseMessageStubEntry } from './parse';

describe('parseMessageStubEntry', () => {
  it('keeps provisional dispatches without transaction address enrichment', () => {
    const message = parseMessageStubEntry(createChainMetadataResolver({}), [], {
      ...messageStubEntry,
      origin_tx_recipient: null,
      origin_tx_sender: null,
    });

    expect(message).toMatchObject({
      origin: {
        from: undefined,
        hash: '0x02',
        to: undefined,
      },
      status: MessageStatus.Pending,
    });
  });

  it('keeps delivered rows whose destination transaction is not enriched yet', () => {
    const message = parseMessageStubEntry(createChainMetadataResolver({}), [], {
      ...messageStubEntry,
      is_delivered: true,
    });

    expect(message).toMatchObject({
      destination: undefined,
      status: MessageStatus.Delivered,
    });
  });

  it('keeps a null body as an empty body', () => {
    const message = parseMessageStubEntry(createChainMetadataResolver({}), [], {
      ...messageStubEntry,
      message_body: null,
    });

    expect(message?.body).toBe('0x');
  });

  it('keeps a partially enriched destination transaction', () => {
    const message = parseMessageStubEntry(createChainMetadataResolver({}), [], {
      ...messageStubEntry,
      delivery_occurred_at: '2026-10-09T12:01:00',
      destination_tx_hash: '\\x08',
      is_delivered: true,
    });

    expect(message?.destination).toEqual({
      from: undefined,
      hash: '0x08',
      timestamp: Date.parse('2026-10-09T12:01:00Z'),
      to: undefined,
    });
  });

  it('marks zero-confirmation live rows as provisional', () => {
    const message = parseMessageStubEntry(createChainMetadataResolver({}), [], {
      ...messageStubEntry,
      live_confirmations: 0,
    });

    expect(message?.isProvisional).toBe(true);
  });

  it('keeps partial destination data when full enrichment is incomplete', () => {
    const message = parseMessageEntry(createChainMetadataResolver({}), [], {
      ...messageEntry,
      delivery_occurred_at: '2026-10-09T12:01:00',
      destination_block_hash: null,
      destination_tx_hash: '\\x08',
      is_delivered: true,
    });

    expect(message?.destination).toEqual({
      from: undefined,
      hash: '0x08',
      timestamp: Date.parse('2026-10-09T12:01:00Z'),
      to: undefined,
    });
  });
});

const messageStubEntry = {
  delivery_latency: null,
  delivery_occurred_at: null,
  destination_chain_id: 10,
  destination_domain_id: 10,
  destination_tx_hash: null,
  destination_tx_id: null,
  destination_tx_recipient: null,
  destination_tx_sender: null,
  id: 1,
  is_delivered: false,
  message_body: '\\x07',
  msg_id: '\\x01',
  nonce: 0,
  origin_chain_id: 1,
  origin_domain_id: 1,
  origin_tx_hash: '\\x02',
  origin_tx_id: 2,
  origin_tx_recipient: '\\x03',
  origin_tx_sender: '\\x04',
  recipient: '\\x05',
  send_occurred_at: '2026-10-09T12:00:00',
  sender: '\\x06',
} satisfies MessageStubEntry;

const messageEntry = {
  ...messageStubEntry,
  destination_block_hash: null,
  destination_block_height: null,
  destination_block_id: null,
  destination_mailbox: '\\x09',
  destination_tx_cumulative_gas_used: null,
  destination_tx_effective_gas_price: null,
  destination_tx_gas_limit: null,
  destination_tx_gas_price: null,
  destination_tx_gas_used: null,
  destination_tx_max_fee_per_gas: null,
  destination_tx_max_priority_fee_per_gas: null,
  destination_tx_nonce: null,
  num_payments: 0,
  origin_block_hash: '\\x0a',
  origin_block_height: 1,
  origin_block_id: 1,
  origin_mailbox: '\\x0b',
  origin_tx_cumulative_gas_used: 1,
  origin_tx_effective_gas_price: 1,
  origin_tx_gas_limit: 1,
  origin_tx_gas_price: 1,
  origin_tx_gas_used: 1,
  origin_tx_max_fee_per_gas: 1,
  origin_tx_max_priority_fee_per_gas: 1,
  origin_tx_nonce: 1,
  total_gas_amount: 0,
  total_payment: 0,
} satisfies MessageEntry;
