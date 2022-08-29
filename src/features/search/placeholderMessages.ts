import { constants } from 'ethers';
import { chain } from 'wagmi';

import {
  avalancheChain,
  bscChain,
  celoMainnetChain,
} from '../../consts/networksConfig';
import { Message, MessageStatus, PartialTransactionReceipt } from '../../types';

const TX_HASH_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const TX_ZERO: PartialTransactionReceipt = {
  from: constants.AddressZero,
  transactionHash: TX_HASH_ZERO,
  blockNumber: 123456789,
  gasUsed: 100_000,
  timestamp: Date.now(),
};

const BODY_ZERO =
  '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const PLACEHOLDER_MESSAGES: Message[] = [
  {
    id: 1,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: 0,
    destinationChainId: 0,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 2,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.polygon.id,
    destinationChainId: chain.optimism.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 3,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: avalancheChain.id,
    destinationChainId: celoMainnetChain.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 4,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: bscChain.id,
    destinationChainId: chain.mainnet.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 5,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.mainnet.id,
    destinationChainId: chain.goerli.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 6,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.mainnet.id,
    destinationChainId: celoMainnetChain.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 7,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.optimism.id,
    destinationChainId: avalancheChain.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
  {
    id: 8,
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: bscChain.id,
    destinationChainId: avalancheChain.id,
    timestamp: Date.now(),
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
  },
];
