/**
 * =================
 * MESSAGE GRAPHQL FRAGMENTS
 * Not co-locating with UI code b.c. the backend also needs these for the API
 * =================
 */
export const messageStubFragment = `
  id
  msg_id
  nonce
  sender
  recipient
  is_delivered
  send_occurred_at
  delivery_occurred_at
  delivery_latency
  origin_chain_id
  origin_domain_id
  origin_tx_id
  origin_tx_hash
  origin_tx_sender
  destination_chain_id
  destination_domain_id
  destination_tx_id
  destination_tx_hash
  destination_tx_sender
`;

export const messageDetailsFragment = `
${messageStubFragment}
  message_body
  origin_block_hash
  origin_block_height
  origin_block_id
  origin_mailbox
  origin_tx_cumulative_gas_used
  origin_tx_effective_gas_price
  origin_tx_gas_limit
  origin_tx_gas_price
  origin_tx_gas_used
  origin_tx_max_fee_per_gas
  origin_tx_max_priority_fee_per_gas
  origin_tx_nonce
  origin_tx_recipient
  destination_block_hash
  destination_block_height
  destination_block_id
  destination_mailbox
  destination_tx_cumulative_gas_used
  destination_tx_effective_gas_price
  destination_tx_gas_limit
  destination_tx_gas_price
  destination_tx_gas_used
  destination_tx_max_fee_per_gas
  destination_tx_max_priority_fee_per_gas
  destination_tx_nonce
  destination_tx_recipient
  total_gas_amount
  total_payment
`;

/**
 * ===================================
 * FRAGMENT TYPES
 * Must correspond with fragments above
 * ====================================
 */
export interface MessageStubEntry {
  id: number; // database id, not message id
  msg_id: string; // binary e.g. \\x123
  nonce: number;
  sender: string; // binary e.g. \\x123
  recipient: string; // binary e.g. \\x123
  is_delivered: boolean;
  send_occurred_at: string; // e.g. "2022-08-28T17:30:15"
  delivery_occurred_at: string | null; // e.g. "2022-08-28T17:30:15"
  delivery_latency: string | null; // e.g. "00:00:32"
  origin_chain_id: number;
  origin_domain_id: number;
  origin_tx_id: number; // database id
  origin_tx_hash: string; // binary e.g. \\x123
  origin_tx_sender: string; // binary e.g. \\x123
  destination_chain_id: number;
  destination_domain_id: number;
  destination_tx_id: number | null; // database id
  destination_tx_hash: string | null; // binary e.g. \\x123
  destination_tx_sender: string | null; // binary e.g. \\x123
}

export interface MessageEntry extends MessageStubEntry {
  message_body: string | null; // binary e.g. \\x123
  origin_block_hash: string; // binary e.g. \\x123
  origin_block_height: number;
  origin_block_id: number; // database id
  origin_mailbox: string; // binary e.g. \\x123
  origin_tx_cumulative_gas_used: number;
  origin_tx_effective_gas_price: number;
  origin_tx_gas_limit: number;
  origin_tx_gas_price: number;
  origin_tx_gas_used: number;
  origin_tx_max_fee_per_gas: number;
  origin_tx_max_priority_fee_per_gas: number;
  origin_tx_nonce: number;
  origin_tx_recipient: string; // binary e.g. \\x123
  destination_block_hash: string | null; // binary e.g. \\x123
  destination_block_height: number | null;
  destination_block_id: number | null; // database id
  destination_mailbox: string; // binary e.g. \\x123
  destination_tx_cumulative_gas_used: number | null;
  destination_tx_effective_gas_price: number | null;
  destination_tx_gas_limit: number | null;
  destination_tx_gas_price: number | null;
  destination_tx_gas_used: number | null;
  destination_tx_max_fee_per_gas: number | null;
  destination_tx_max_priority_fee_per_gas: number | null;
  destination_tx_nonce: number | null;
  destination_tx_recipient: string; // binary e.g. \\x123
  total_gas_amount: number;
  total_payment: number;
}

export interface MessagesStubQueryResult {
  message_view: MessageStubEntry[];
}

export interface MessagesQueryResult {
  message_view: MessageEntry[];
}
