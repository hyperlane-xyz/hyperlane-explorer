import { MultiProvider, chainMetadata, hyperlaneEnvironments } from '@hyperlane-xyz/sdk';

import { ChainConfig } from '../../chains/chainConfig';

import { fetchMessagesFromPiChain } from './usePiChainMessageQuery';

// NOTE: THESE TESTS WILL NO LONGER WORK ONCE THE MESSAGE USED BELOW
// IS OUT OF PROVIDER_LOGS_BLOCK_WINDOW USED TO QUERY
// THESE WERE MOSTLY USED FOR TDD OF THE FETCHING CODE
// TODO: MOCK THE PROVIDER + EXPLORER TO MAKE THESE NETWORK INDEPENDENT

jest.setTimeout(30000);

const multiProvider = new MultiProvider();
const goerliMailbox = hyperlaneEnvironments.testnet.goerli.mailbox;
const goerliConfigWithExplorer: ChainConfig = {
  ...chainMetadata.goerli,
  contracts: { mailbox: goerliMailbox },
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { blockExplorers, ...goerliConfigNoExplorer } = goerliConfigWithExplorer;

// https://explorer.hyperlane.xyz/message/0x328b582541b896dbb2258750bb26ac9d3b6d24424cf5b62ba466f949e80f0f48
const txHash = '0x051695a31a6feccacebf09f0c426e21ff4d5c894603faa658c3b4cff89653978';
const msgId = '0x328b582541b896dbb2258750bb26ac9d3b6d24424cf5b62ba466f949e80f0f48';
const senderAddress = '0x0637a1360ea44602dae5c4ba515c2bcb6c762fbc';
const recipientAddress = '0xa76a3e719e5ff7159a29b8876272052b89b3589f';

const goerliMessage = {
  id: '',
  msgId: '0x328b582541b896dbb2258750bb26ac9d3b6d24424cf5b62ba466f949e80f0f48',
  originChainId: 5,
  originDomainId: 5,
  destinationChainId: 421613,
  destinationDomainId: 421613,
  nonce: 21048,
  body: '0x48656c6c6f21',
  originTimestamp: 1678444980000,
  originTransaction: {
    blockNumber: 8629961,
    from: '0x06C8798aA665bDbeea6aBa6fC1b1d9bbDCa8d613',
    gasUsed: 0,
    timestamp: 1678444980000,
    transactionHash: '0x051695a31a6feccacebf09f0c426e21ff4d5c894603faa658c3b4cff89653978',
  },
  sender: '0x0637A1360Ea44602DAe5c4ba515c2BCb6C762fbc',
  recipient: '0xa76A3E719E5ff7159a29B8876272052b89B3589F',
  status: 'unknown',
  isPiMsg: true,
};

describe('fetchMessagesFromPiChain', () => {
  // beforeEach(async () => {});

  it('Fetches messages using explorer for tx hash', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      { input: txHash },
      multiProvider,
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using explorer for msg id', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      { input: msgId },
      multiProvider,
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using explorer for sender address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      {
        input: senderAddress,
        fromBlock: goerliMessage.originTransaction.blockNumber - 100,
      },
      multiProvider,
    );
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect(testMsg).toBeTruthy();
  });
  it('Fetches messages using explorer for recipient address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigWithExplorer,
      {
        input: recipientAddress,
        fromBlock: goerliMessage.originTransaction.blockNumber - 100,
      },
      multiProvider,
    );
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect(testMsg).toBeTruthy();
  });
  it('Fetches messages using provider for tx hash', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      { input: txHash },
      multiProvider,
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for msg id', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      { input: msgId },
      multiProvider,
    );
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for sender address', async () => {
    const messages = await fetchMessagesFromPiChain(
      goerliConfigNoExplorer,
      {
        input: senderAddress,
      },
      multiProvider,
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
      multiProvider,
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
      multiProvider,
    );
    expect(messages).toEqual([]);
  });
});
