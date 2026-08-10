import { Mailbox__factory as MailboxFactory } from '@hyperlane-xyz/core';
import type { IRegistry } from '@hyperlane-xyz/registry';
import { chainAddresses, chainMetadata } from '@hyperlane-xyz/registry';
import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { addressToBytes32, formatMessage, messageId, normalizeAddress } from '@hyperlane-xyz/utils';
import type { providers } from 'ethers';

import { Message, MessageStatus } from '../../../types';
import type { ExplorerMultiProvider } from '../../hyperlane/sdkRuntime';
import { fetchMessagesFromPiChain } from './fetchPiChainMessages';

const mailbox = MailboxFactory.createInterface();
const sepoliaMailbox = chainAddresses.sepolia.mailbox;
const sepoliaConfig: ChainMetadata<{ mailbox: string }> = {
  ...chainMetadata.sepolia,
  mailbox: sepoliaMailbox,
};

const txHash = `0x${'12'.repeat(32)}`;
const senderAddress = '0x405bfdecb33230b4ad93c29ba4499b776cfba189';
const recipientAddress = '0x5da3b8d6f73df6003a490072106730218c475aad';
const destinationDomain = 43113;
const blockNumber = 123;
const timestamp = 1_722_470_400;
const encodedMessage = formatMessage(
  0,
  25_459,
  sepoliaConfig.domainId,
  senderAddress,
  destinationDomain,
  recipientAddress,
  '0x48656c6c6f21',
);
const msgId = messageId(encodedMessage);

const dispatchEvent = mailbox.encodeEventLog(mailbox.getEvent('Dispatch'), [
  senderAddress,
  destinationDomain,
  addressToBytes32(recipientAddress),
  encodedMessage,
]);
const dispatchIdEvent = mailbox.encodeEventLog(mailbox.getEvent('DispatchId'), [msgId]);

const baseLog = {
  address: sepoliaMailbox,
  blockHash: `0x${'34'.repeat(32)}`,
  blockNumber,
  from: senderAddress,
  logIndex: 0,
  removed: false,
  to: sepoliaMailbox,
  transactionHash: txHash,
  transactionIndex: 0,
};
const dispatchLog = { ...baseLog, ...dispatchEvent };
const dispatchIdLog = { ...baseLog, ...dispatchIdEvent, logIndex: 1 };

const expectedMessage: Message = {
  id: '',
  msgId,
  originChainId: sepoliaConfig.chainId,
  originDomainId: sepoliaConfig.domainId,
  destinationChainId: destinationDomain,
  destinationDomainId: destinationDomain,
  nonce: 25_459,
  body: '0x48656c6c6f21',
  sender: normalizeAddress(senderAddress),
  recipient: normalizeAddress(recipientAddress),
  status: MessageStatus.Unknown,
  origin: {
    timestamp: timestamp * 1000,
    hash: txHash,
    from: normalizeAddress(senderAddress),
    to: sepoliaMailbox,
    blockHash: baseLog.blockHash,
    blockNumber,
    mailbox: sepoliaMailbox,
    nonce: 0,
    gasLimit: 0,
    gasPrice: 0,
    effectiveGasPrice: 0,
    gasUsed: 0,
    cumulativeGasUsed: 0,
    maxFeePerGas: 0,
    maxPriorityPerGas: 0,
  },
  isPiMsg: true,
};

describe('fetchMessagesFromPiChain', () => {
  it('fetches a message by transaction hash', async () => {
    await expect(fetch({ input: txHash })).resolves.toEqual([expectedMessage]);
  });

  it('fetches a message by message id', async () => {
    await expect(fetch({ input: msgId })).resolves.toEqual([expectedMessage]);
  });

  it.each([senderAddress, recipientAddress])('fetches a message by address', async (input) => {
    await expect(fetch({ input, fromBlock: 1 })).resolves.toEqual([expectedMessage]);
  });

  it('returns no messages for invalid input', async () => {
    await expect(fetch({ input: 'invalidInput' })).resolves.toEqual([]);
  });
});

function fetch(query: { input: string; fromBlock?: number }) {
  const provider = createProvider();
  const multiProvider = {
    getChainId: () => sepoliaConfig.chainId,
    getEthersV5Provider: () => provider,
    tryGetChainId: () => destinationDomain,
  } as unknown as ExplorerMultiProvider;

  return fetchMessagesFromPiChain(sepoliaConfig, query, multiProvider, {} as IRegistry);
}

function createProvider() {
  return {
    getBlock: jest.fn(async () => ({ timestamp })),
    getBlockNumber: jest.fn(async () => blockNumber),
    getLogs: jest.fn(async (filter: providers.Filter) => {
      const topics = filter.topics ?? [];
      if (matchesTopics(dispatchLog.topics, topics)) return [dispatchLog];
      if (matchesTopics(dispatchIdLog.topics, topics)) return [dispatchIdLog];
      return [];
    }),
    getTransactionReceipt: jest.fn(async (hash: string) =>
      hash === txHash
        ? {
            blockNumber,
            from: senderAddress,
            logs: [dispatchLog],
            to: sepoliaMailbox,
          }
        : null,
    ),
  } as unknown as providers.Provider;
}

function matchesTopics(logTopics: string[], filterTopics: providers.Filter['topics']) {
  return (filterTopics ?? []).every((topic, index) => topic === null || topic === logTopics[index]);
}
