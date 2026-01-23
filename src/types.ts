import { ChainMap, TokenArgs, WarpCoreConfig } from '@hyperlane-xyz/sdk';
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
  to: Address;
}

export interface MessageTx extends MessageTxStub {
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
  body: string;
}

export interface Message extends MessageStub {
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

export type TokenArgsWithWireDecimals = TokenArgs & { wireDecimals: number };

export interface WarpRouteDetails {
  amount: string;
  transferRecipient: string;
  originToken: TokenArgsWithWireDecimals;
  destinationToken: TokenArgsWithWireDecimals;
}

export type WarpRouteChainAddressMap = ChainMap<Record<Address, TokenArgsWithWireDecimals>>;

// Map of warp route ID (e.g., "USDC/mainnet-cctp") to its configuration
export type WarpRouteConfigs = Record<string, WarpCoreConfig>;
