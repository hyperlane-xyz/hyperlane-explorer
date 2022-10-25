// Modeled after ethers.providers.TransactionReceipt
export interface PartialTransactionReceipt {
  from: Address;
  transactionHash: string;
  blockNumber: number;
  gasUsed: number;
  timestamp: number;
}

// TODO consider reconciling with SDK's MessageStatus
export enum MessageStatus {
  Pending = 'pending',
  Delivered = 'delivered',
  Failing = 'failing',
}

export interface MessageStub {
  id: number;
  status: MessageStatus;
  sender: Address;
  recipient: Address;
  originDomainId: number;
  destinationDomainId: number;
  originChainId: number;
  destinationChainId: number;
  timestamp: number; // Note, equivalent to timestamp in originTx
}

export interface Message extends MessageStub {
  body: string;
  leafIndex: number;
  hash: string; // message hash, not related to txs
  originTransaction: PartialTransactionReceipt;
  destinationTransaction?: PartialTransactionReceipt;
}
