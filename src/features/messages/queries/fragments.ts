/**
 * =================
 * MESSAGE GRAPHQL FRAGMENTS
 * Not co-locating with UI code b.c. the backend also needs these for the API
 * =================
 */
export const messageStubFragment = `
  id
  msg_id
  destination
  origin
  recipient
  sender
  timestamp
  delivered_message {
    id
    tx_id
    destination_mailbox
    transaction {
      block {
        timestamp
      }
    }
  }
  message_states {
    block_height
    block_timestamp
    error_msg
    estimated_gas_cost
    id
    processable
  }
`;

export const messageDetailsFragment = `
  destination
  id
  msg_id
  nonce
  msg_body
  origin
  origin_tx_id
  origin_mailbox
  recipient
  sender
  timestamp
  transaction {
    id
    block_id
    gas_used
    hash
    sender
    block {
      hash
      domain
      height
      id
      timestamp
    }
  }
  delivered_message {
    id
    tx_id
    destination_mailbox
    transaction {
      block_id
      gas_used
      hash
      id
      sender
      block {
        domain
        hash
        height
        id
        timestamp
      }
    }
  }
  message_states {
    block_height
    block_timestamp
    error_msg
    estimated_gas_cost
    id
    processable
  }
`;

/**
 * ===================================
 * FRAGMENT TYPES
 * Must correspond with fragments above
 * ====================================
 */

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
  tx_id: number;
  destination_mailbox: string;
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
  msg_id: string;
  destination: number;
  origin: number;
  recipient: string; // binary e.g. \\x123
  sender: string; // binary e.g. \\x123
  timestamp: string; // e.g. "2022-08-28T17:30:15"
  delivered_message: DeliveredMessageStubEntry | null | undefined;
  message_states: MessageStateEntry[];
}

export interface MessageEntry extends MessageStubEntry {
  nonce: number;
  msg_body: string | null | undefined; // binary e.g. \\x123
  origin_mailbox: string;
  origin_tx_id: number;
  transaction: TransactionEntry; // origin transaction
  delivered_message: DeliveredMessageEntry | null | undefined;
}

export interface MessagesStubQueryResult {
  message: MessageStubEntry[];
}

export interface MessagesQueryResult {
  message: MessageEntry[];
}
