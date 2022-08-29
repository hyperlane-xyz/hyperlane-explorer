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

// Partially modeled after SDK AbacusMessage class
export interface Message {
  id: number;
  status: MessageStatus;
  sender: Address;
  recipient: Address;
  body: string;
  originChainId: number;
  destinationChainId: number;
  timestamp: number; // Note, equivalent to timestamp in originTx
  originTransaction: PartialTransactionReceipt;
  destinationTransaction?: PartialTransactionReceipt;
}
