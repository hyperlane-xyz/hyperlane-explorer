import { createChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';

import { MessageStatus } from '../../../types';
import type { MessageStubEntry } from './fragments';
import { parseMessageStubEntry } from './parse';

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
