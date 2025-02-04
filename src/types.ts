import { ChainMetadata, ChainName } from '@hyperlane-xyz/sdk';
import type { providers } from 'ethers';

// TODO consider reconciling with SDK's MessageStatus
export enum MessageStatus {
  Unknown = 'unknown',
  Pending = 'pending',
  Delivered = 'delivered',
  Failing = 'failing',
}

export interface MessageTxStub {
  timestamp: number;
  hash: string;
  from: Address;
}

export interface MessageTx extends MessageTxStub {
  to: Address;
  blockHash: string;
  blockNumber: number;
  mailbox: Address;
  nonce: number;
  gasLimit: number;
  gasPrice: number;
  effectiveGasPrice: number;
  gasUsed: number;
  cumulativeGasUsed: number;
  maxFeePerGas: number;
  maxPriorityPerGas: number;
}

export interface MessageStub {
  status: MessageStatus;
  id: string; // Database id
  msgId: string; // Message hash
  nonce: number; // formerly leafIndex
  sender: Address;
  recipient: Address;
  originChainId: ChainId;
  originDomainId: number;
  destinationChainId: ChainId;
  destinationDomainId: number;
  origin: MessageTxStub;
  destination?: MessageTxStub;
  isPiMsg?: boolean;
  originMetadata?: ChainMetadata | null;
  destinationMetadata?: ChainMetadata | null;
}

export interface Message extends MessageStub {
  body: string;
  decodedBody?: string;
  origin: MessageTx;
  destination?: MessageTx;
  totalGasAmount?: string;
  totalPayment?: string;
  numPayments?: number;
}

export interface ExtendedLog extends providers.Log {
  timestamp?: number;
  from?: Address;
  to?: Address;
}

export interface WarpRouteDetails {
  amount: string;
  totalPayment: string;
  endRecipient: string;
  originTokenAddress: string;
  originTokenSymbol: string;
  destinationTokenAddress: string;
  destinationTokenSymbol: string;
}

export type WarpRouteMap = Record<ChainName, Record<Address, string>>;
