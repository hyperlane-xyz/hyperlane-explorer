import { constants } from 'ethers';

import { Message, MessageStatus, PartialTransactionReceipt } from '../../types';

const TX_HASH_ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const TX_ZERO: PartialTransactionReceipt = {
  from: constants.AddressZero,
  transactionHash: TX_HASH_ZERO,
  blockNumber: 123456789,
  gasUsed: 100_000,
  timestamp: Date.now(),
};

const BODY_ZERO =
  '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const PLACEHOLDER_MESSAGE: Message = {
  id: 1,
  leafIndex: 1,
  status: MessageStatus.Pending,
  sender: constants.AddressZero,
  recipient: constants.AddressZero,
  body: BODY_ZERO,
  hash: TX_HASH_ZERO,
  originDomainId: 0,
  destinationDomainId: 0,
  originChainId: 0,
  destinationChainId: 0,
  originTimestamp: Date.now(),
  destinationTimestamp: Date.now(),
  originTransaction: TX_ZERO,
  destinationTransaction: TX_ZERO,
};
