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
  to: constants.AddressZero,
  from: constants.AddressZero,
  contractAddress: constants.AddressZero,
  transactionHash: TX_HASH_ZERO,
  blockNumber: 123456789,
};

const BODY_ZERO =
  '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const PLACEHOLDER_MESSAGES: Message[] = [
  {
    id: '1',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.mainnet.id,
    destinationChainId: chain.arbitrum.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '2',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.polygon.id,
    destinationChainId: chain.optimism.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '3',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: avalancheChain.id,
    destinationChainId: celoMainnetChain.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '4',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: bscChain.id,
    destinationChainId: chain.mainnet.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '5',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.mainnet.id,
    destinationChainId: chain.goerli.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '6',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.mainnet.id,
    destinationChainId: celoMainnetChain.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '7',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: chain.optimism.id,
    destinationChainId: avalancheChain.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
  {
    id: '8',
    status: MessageStatus.Pending,
    sender: constants.AddressZero,
    recipient: constants.AddressZero,
    body: BODY_ZERO,
    originChainId: bscChain.id,
    destinationChainId: avalancheChain.id,
    originTransaction: TX_ZERO,
    destinationTransaction: TX_ZERO,
    originTimeSent: Date.now(),
    destinationTimeSent: Date.now(),
  },
];
