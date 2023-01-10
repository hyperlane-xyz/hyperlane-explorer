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
  id: string; // Database id
  msgId: string; // Message hash
  status: MessageStatus;
  sender: Address;
  recipient: Address;
  originDomainId: number;
  destinationDomainId: number;
  originChainId: number;
  destinationChainId: number;
  originTimestamp: number; // Note, equivalent to timestamp in originTransaction
  destinationTimestamp?: number; // Note, equivalent to timestamp in destinationTransaction
}

export interface Message extends MessageStub {
  nonce: number; // formerly leafIndex
  body: string;
  decodedBody?: string;
  originTransaction: PartialTransactionReceipt;
  destinationTransaction?: PartialTransactionReceipt;
}
