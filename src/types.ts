// Modeled after ethers.providers.TransactionReceipt
export interface PartialTransactionReceipt {
  to: Address;
  from: Address;
  contractAddress: Address;
  transactionHash: string;
  blockNumber: number;
}

// TODO consider reconciling with SDK's MessageStatus
export enum MessageStatus {
  Pending = 'pending',
  Delivered = 'delivered',
  Failing = 'failing',
}

// Partially modeled after SDK AbacusMessage class
export interface Message {
  id: string;
  status: MessageStatus;
  sender: Address;
  recipient: Address;
  body: string;
  originChainId: number;
  destinationChainId: number;
  originTransaction: PartialTransactionReceipt;
  destinationTransaction?: PartialTransactionReceipt;
  originTimeSent: number; // timestamp
  destinationTimeSent?: number; // timestamp
}
