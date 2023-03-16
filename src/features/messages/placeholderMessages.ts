import { constants } from 'ethers';

import { Message, MessageStatus, MessageTx } from '../../types';

export const TX_HASH_ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const TX_ZERO: MessageTx = {
  timestamp: Date.now(),
  hash: TX_HASH_ZERO,
  from: constants.AddressZero,
  to: constants.AddressZero,
  blockHash: TX_HASH_ZERO,
  blockNumber: 123456789,
  mailbox: constants.AddressZero,
  nonce: 0,
  gasLimit: 100_000,
  gasPrice: 100,
  effectiveGasPrice: 100,
  gasUsed: 100_000,
  cumulativeGasUsed: 100_000,
  maxFeePerGas: 100,
  maxPriorityPerGas: 100,
};

const BODY_ZERO =
  '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const PLACEHOLDER_MESSAGE: Message = {
  id: '1',
  msgId: TX_HASH_ZERO,
  nonce: 1,
  status: MessageStatus.Pending,
  sender: constants.AddressZero,
  recipient: constants.AddressZero,
  body: BODY_ZERO,
  originDomainId: 0,
  destinationDomainId: 0,
  originChainId: 0,
  destinationChainId: 0,
  origin: TX_ZERO,
  destination: TX_ZERO,
  totalGasAmount: 100_000,
  totalPayment: 100_000,
};
