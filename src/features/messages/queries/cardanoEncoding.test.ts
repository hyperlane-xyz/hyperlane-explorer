import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { builtinChainMetadata } from '../../../consts/chains';
import {
  addressToPostgresBytea,
  postgresByteaToAddress,
  postgresByteaToTxHash,
  searchValueToPostgresBytea,
} from './encoding';
import type { MessageEntry } from './fragments';
import { parseMessageQueryResult } from './parse';

const cardanoPreview = builtinChainMetadata.cardanopreview as ChainMetadata;
const sepoliaMetadata = {
  name: 'sepolia',
  domainId: 11155111,
  chainId: 11155111,
  protocol: ProtocolType.Ethereum,
  rpcUrls: [{ http: 'https://sepolia.invalid' }],
} as ChainMetadata;

// A script-credential sender, as the Cardano indexer records it:
// [0x02, 0x00, 0x00, 0x00, <28-byte script hash>].
const SCRIPT_SENDER_BYTEA = '\\x02000000' + '12'.repeat(28);
const SCRIPT_SENDER_ADDRESS = 'addr_test1wqfpyysjzgfpyysjzgfpyysjzgfpyysjzgfpyysjzgfpyysu9csdk';

// Right-aligned in the H512 transaction id, so the scraper stores 32 bytes.
const TX_HASH = 'aa'.repeat(32);

describe('Cardano message encoding', () => {
  it('renders script credentials as bech32 addresses', () => {
    expect(postgresByteaToAddress(SCRIPT_SENDER_BYTEA, cardanoPreview)).toEqual(
      SCRIPT_SENDER_ADDRESS,
    );
  });

  it('renders transaction hashes as bare hex', () => {
    expect(postgresByteaToTxHash(`\\x${TX_HASH}`, cardanoPreview)).toEqual(TX_HASH);
  });

  it('encodes a bech32 address back to the bytes the scraper stored', () => {
    expect(addressToPostgresBytea(SCRIPT_SENDER_ADDRESS)).toEqual(SCRIPT_SENDER_BYTEA);
  });

  it('encodes a searched transaction hash to the bytes the scraper stored', () => {
    expect(searchValueToPostgresBytea(TX_HASH)).toEqual(`\\x${TX_HASH}`);
  });

  it('finds messages by searching for a Cardano address', () => {
    expect(searchValueToPostgresBytea(SCRIPT_SENDER_ADDRESS)).toEqual(SCRIPT_SENDER_BYTEA);
  });

  it('describes the Cardano test networks as Cardano chains', () => {
    for (const name of ['cardano', 'cardanopreprod', 'cardanopreview']) {
      expect(builtinChainMetadata[name].protocol).toEqual(ProtocolType.Cardano);
    }
    expect(builtinChainMetadata.cardanopreview.domainId).toEqual(2003);
    expect(builtinChainMetadata.cardano.bech32Prefix).toEqual('addr');
    expect(builtinChainMetadata.cardanopreview.bech32Prefix).toEqual('addr_test');
  });
});

// Exactly what Hasura returns for a scraped Cardano dispatch. `origin_tx_recipient`
// is null because a Cardano transaction pays out to many UTXOs and so has no
// single recipient, and the message is undelivered so every destination-side
// column is null too.
const cardanoMessageRow: MessageEntry = {
  id: 1,
  msg_id: '\\x' + 'deadbeef'.repeat(8),
  nonce: 7,
  sender: SCRIPT_SENDER_BYTEA,
  recipient: '\\x000000000000000000000000742d35cc6634c0532925a3b844bc454e4438f44e',
  is_delivered: false,
  send_occurred_at: '2026-07-29T07:54:31.865',
  delivery_occurred_at: null,
  delivery_latency: null,
  origin_chain_id: 2003,
  origin_domain_id: 2003,
  origin_tx_id: 1,
  origin_tx_hash: `\\x${TX_HASH}`,
  origin_tx_sender: '\\x00000000c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
  origin_tx_recipient: null,
  destination_chain_id: 11155111,
  destination_domain_id: 11155111,
  destination_tx_id: null,
  destination_tx_hash: null,
  destination_tx_sender: null,
  destination_tx_recipient: null,
  message_body: '\\x0102',
  origin_block_hash: '\\x' + '11'.repeat(32),
  origin_block_height: 3500000,
  origin_block_id: 1,
  origin_mailbox: '\\x02000000feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
  origin_tx_cumulative_gas_used: 182000,
  origin_tx_effective_gas_price: 0,
  origin_tx_gas_limit: 182000,
  origin_tx_gas_price: 0,
  origin_tx_gas_used: 182000,
  origin_tx_max_fee_per_gas: 0,
  origin_tx_max_priority_fee_per_gas: 0,
  origin_tx_nonce: 3,
  destination_block_hash: null,
  destination_block_height: null,
  destination_block_id: null,
  destination_mailbox: '',
  destination_tx_cumulative_gas_used: null,
  destination_tx_effective_gas_price: null,
  destination_tx_gas_limit: null,
  destination_tx_gas_price: null,
  destination_tx_gas_used: null,
  destination_tx_max_fee_per_gas: null,
  destination_tx_max_priority_fee_per_gas: null,
  destination_tx_nonce: null,
  total_gas_amount: 250000,
  total_payment: 1500000,
  num_payments: 1,
};

describe('Cardano message parsing', () => {
  const resolver = {
    tryGetChainMetadata: (id: string | number) => (id === 2003 ? cardanoPreview : sepoliaMetadata),
    tryGetChainName: (id: string | number) => (id === 2003 ? 'cardanopreview' : 'sepolia'),
    tryGetProtocol: (id: string | number) =>
      id === 2003 ? ProtocolType.Cardano : ProtocolType.Ethereum,
  } as unknown as Parameters<typeof parseMessageQueryResult>[0];

  const scrapedChains = [
    {
      id: 2003,
      name: 'cardanopreview',
      native_token: 'ADA',
      is_test_net: true,
      is_deprecated: false,
      chain_id: 2003,
    },
    {
      id: 11155111,
      name: 'sepolia',
      native_token: 'ETH',
      is_test_net: true,
      is_deprecated: false,
      chain_id: 11155111,
    },
  ];

  it('parses a scraped Cardano dispatch', () => {
    const [message] = parseMessageQueryResult(resolver, scrapedChains, {
      q0: [cardanoMessageRow],
    });

    expect(message).toBeDefined();
    expect(message.sender).toEqual(SCRIPT_SENDER_ADDRESS);
    expect(message.origin.hash).toEqual(TX_HASH);
    // A Cardano transaction has no single recipient, so the column is null.
    expect(message.origin.to).toEqual('');
    expect(message.destination).toBeUndefined();
    expect(message.body).toEqual('0x0102');
  });

  it('parses a Cardano dispatch with an empty body', () => {
    const [message] = parseMessageQueryResult(resolver, scrapedChains, {
      q0: [{ ...cardanoMessageRow, message_body: null }],
    });

    expect(message).toBeDefined();
    expect(message.body).toEqual('');
  });
});
