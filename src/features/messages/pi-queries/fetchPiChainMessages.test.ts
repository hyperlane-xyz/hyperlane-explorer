import { chainMetadata, hyperlaneEnvironments } from '@hyperlane-xyz/sdk';

import { Message, MessageStatus } from '../../../types';
import { ChainConfig } from '../../chains/chainConfig';
import { SmartMultiProvider } from '../../providers/multiProvider';

import { fetchMessagesFromPiChain } from './fetchPiChainMessages';

// NOTE: THE GOERLI MESSAGE MAY NEED TO BE UPDATED ON OCCASION AS IT GETS TOO OLD
// THIS IS DUE TO LIMITATIONS OF THE RPC PROVIDER
// TODO: MOCK THE PROVIDER TO MAKE THESE NETWORK INDEPENDENT

jest.setTimeout(30000);

const goerliMailbox = hyperlaneEnvironments.testnet.goerli.mailbox;
const goerliIgp = hyperlaneEnvironments.testnet.goerli.interchainGasPaymaster;
const goerliConfigWithExplorer: ChainConfig = {
  ...chainMetadata.goerli,
  contracts: { mailbox: goerliMailbox, interchainGasPaymaster: goerliIgp },
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { blockExplorers, ...goerliConfigNoExplorer } = goerliConfigWithExplorer;

// https://explorer.hyperlane.xyz/message/0xfec74152c40d8dfe117bf1a83ba443c85d0de8962272445019c526686a70459e
const txHash = '0xea0ba6b69ca70147d7cfdc2a806fe6b6ca5bce143408ebcf348fdec30cdd7daf';
const msgId = '0xfec74152c40d8dfe117bf1a83ba443c85d0de8962272445019c526686a70459e';
const senderAddress = '0x405bfdecb33230b4ad93c29ba4499b776cfba189';
const recipientAddress = '0x5da3b8d6f73df6003a490072106730218c475aad';

const goerliMessage: Message = {
  id: '',
  msgId: '0xfec74152c40d8dfe117bf1a83ba443c85d0de8962272445019c526686a70459e',
  originChainId: 5,
  originDomainId: 5,
  destinationChainId: 43113,
  destinationDomainId: 43113,
  nonce: 25459,
  body: '0x48656c6c6f21',
  sender: '0x405BFdEcB33230b4Ad93C29ba4499b776CfBa189',
  recipient: '0x5da3b8d6F73dF6003A490072106730218c475AAd',
  status: MessageStatus.Unknown,
  origin: {
    timestamp: 1682842440000,
    hash: '0xea0ba6b69ca70147d7cfdc2a806fe6b6ca5bce143408ebcf348fdec30cdd7daf',
    from: '0x06C8798aA665bDbeea6aBa6fC1b1d9bbDCa8d613',
    to: '0x405BFdEcB33230b4Ad93C29ba4499b776CfBa189',
    blockHash: '0x62ac4553144fedd8582bc8d5c4e5186d8885f92d85aafd48a6bb4f3cf077e0e9',
    blockNumber: 8916552,
    mailbox: '0xCC737a94FecaeC165AbCf12dED095BB13F037685',
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
  it('Fetches messages using explorer for tx hash', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      { input: txHash },
      createMP(goerliConfigWithExplorer),
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using explorer for msg id', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      { input: msgId },
      createMP(goerliConfigWithExplorer),
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using explorer for sender address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      {
        input: senderAddress,
        fromBlock: goerliMessage.origin.blockNumber - 100,
      },
      createMP(goerliConfigWithExplorer),
    );
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect(testMsg).toBeTruthy();
  });
  it('Fetches messages using explorer for recipient address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      {
        input: recipientAddress,
        fromBlock: goerliMessage.origin.blockNumber - 100,
      },
      createMP(goerliConfigWithExplorer),
    );
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect(testMsg).toBeTruthy();
  });
  it('Fetches messages using provider for tx hash', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      { input: txHash },
      createMP(goerliConfigNoExplorer),
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for msg id', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      { input: msgId },
      createMP(goerliConfigNoExplorer),
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for sender address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      {
        input: senderAddress,
      },
      createMP(goerliConfigNoExplorer),
    );
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect(testMsg).toBeTruthy();
  });
  it('Fetches messages using provider for recipient address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      {
        input: recipientAddress,
      },
      createMP(goerliConfigNoExplorer),
    );
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect(testMsg).toBeTruthy();
  });
  it('Returns empty for invalid input', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      {
        input: 'invalidInput',
      },
      createMP(goerliConfigNoExplorer),
    );
    expect(messages).toEqual([]);
  });
});

function createMP(config: ChainConfig) {
  return new SmartMultiProvider({ ...chainMetadata, goerli: config });
}
