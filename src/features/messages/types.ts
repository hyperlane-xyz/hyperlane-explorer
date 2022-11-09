// Models for objects on the server db
// Local models in src/types are simplified,
// post-parse versions for use throughout UI

// These should correspond to queries in MessageSearch and MessageDetails
// Alternatively, could be auto-generated with https://www.graphql-code-generator.com/plugins/typescript/typescript-urql

export interface BlockEntry {
  id: string;
  hash: string; // binary e.g. \\x123
  domain: number;
  height: number;
  timestamp: string; // e.g. "2022-08-28T17:30:15"
}

export interface TransactionEntry {
  id: number;
  block_id: number;
  gas_used: number;
  hash: string; // binary e.g. \\x123
  sender: string; // binary e.g. \\x123
  block: BlockEntry;
}

export interface DeliveredMessageStubEntry {
  id: number;
  inbox_address: string; // binary e.g. \\x123
  tx_id: number;
  transaction: {
    block: {
      timestamp: string; // e.g. "2022-08-28T17:30:15"
    };
  };
}

export interface DeliveredMessageEntry extends DeliveredMessageStubEntry {
  transaction: TransactionEntry;
}

export interface MessageStateEntry {
  id: number;
  block_height: number;
  block_timestamp: string; // e.g. "2022-08-28T17:30:15",
  error_msg: string | null | undefined;
  estimated_gas_cost: number;
  processable: boolean;
}

export interface MessageStubEntry {
  id: number;
  destination: number;
  origin: number;
  recipient: string; // binary e.g. \\x123
  sender: string; // binary e.g. \\x123
  timestamp: string; // e.g. "2022-08-28T17:30:15"
  transaction: TransactionEntry; // origin transaction
  delivered_message: DeliveredMessageStubEntry | null | undefined;
  message_states: MessageStateEntry[];
}

export interface MessageEntry extends MessageStubEntry {
  outbox_address: string; // binary e.g. \\x123
  msg_body: string | null | undefined; // binary e.g. \\x123
  hash: string; // message hash, not related to tx
  leaf_index: number;
  origin_tx_id: number;
  delivered_message: DeliveredMessageEntry | null | undefined;
}

export interface MessagesStubQueryResult {
  message: MessageStubEntry[];
}

export interface MessagesQueryResult {
  message: MessageEntry[];
}
