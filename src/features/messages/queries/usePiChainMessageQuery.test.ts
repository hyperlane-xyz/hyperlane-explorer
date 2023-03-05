import { chainMetadata, hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';

import { ChainConfig } from '../../chains/chainConfig';

import { fetchMessagesFromPiChain } from './usePiChainMessageQuery';

// NOTE: THESE TESTS WILL NO LONGER WORK ONCE THE MESSAGE USED BELOW
// IS OUT OF PROVIDER_LOGS_BLOCK_WINDOW USED TO QUERY
// THESE WERE MOSTLY USED FOR TDD OF THE FETCHING CODE
// TODO: MOCK THE PROVIDER + EXPLORER TO MAKE THESE NETWORK INDEPENDENT

jest.setTimeout(15000);

const goerliMailbox = hyperlaneCoreAddresses.goerli.mailbox;
const goerliConfigWithExplorer: ChainConfig = {
  ...chainMetadata.goerli,
  contracts: { mailbox: goerliMailbox },
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { blockExplorers, ...goerliConfigNoExplorer } = goerliConfigWithExplorer;

// https://explorer.hyperlane.xyz/message/0d9dc662da32d3737835295e9c9eb2b92ac630aec2756b93a187b8fd22a82afd
const txHash = '0xb81ba87ee7ae30dea0f67f7f25b67d973cec6533e7407ea7a8c761f39d8dee1b';
const msgId = '0x0d9dc662da32d3737835295e9c9eb2b92ac630aec2756b93a187b8fd22a82afd';
const senderAddress = '0x0637a1360ea44602dae5c4ba515c2bcb6c762fbc';
const recipientAddress = '0x921d3a71386d3ab8f3ad4ec91ce1556d5fc26859';

const goerliMessage = {
  body: '0x48656c6c6f21',
  destinationChainId: 44787,
  destinationDomainId: 44787,
  destinationTimestamp: 0,
  destinationTransaction: {
    blockNumber: 0,
    from: '0x0000000000000000000000000000000000000000',
    gasUsed: 0,
    timestamp: 0,
    transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  id: '',
  msgId: '0x0d9dc662da32d3737835295e9c9eb2b92ac630aec2756b93a187b8fd22a82afd',
  nonce: 20763,
  originChainId: 5,
  originDomainId: 5,
  originTimestamp: 0,
  originTransaction: {
    blockNumber: 8600958,
    from: '0x0000000000000000000000000000000000000000',
    gasUsed: 0,
    timestamp: 0,
    transactionHash: '0xb81ba87ee7ae30dea0f67f7f25b67d973cec6533e7407ea7a8c761f39d8dee1b',
  },
  recipient: '0x000000000000000000000000921d3a71386d3ab8f3ad4ec91ce1556d5fc26859',
  sender: '0x0000000000000000000000000637a1360ea44602dae5c4ba515c2bcb6c762fbc',
  status: 'unknown',
};

describe('fetchMessagesFromPiChain', () => {
  it('Fetches messages using explorer for tx hash', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigWithExplorer, txHash);
    expect(messages).toEqual([goerliMessage]);
  });
  it.skip('Fetches messages using explorer for msg id', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigWithExplorer, msgId);
    expect(messages).toEqual([goerliMessage]);
  });
  it.skip('Fetches messages using explorer for sender address', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigWithExplorer, senderAddress);
    expect(messages).toEqual([goerliMessage]);
  });
  it.skip('Fetches messages using explorer for recipient address', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigWithExplorer, recipientAddress);
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for tx hash', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigNoExplorer, txHash);
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for msg id', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigNoExplorer, msgId);
    expect(messages).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for sender address', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigNoExplorer, senderAddress);
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect([testMsg]).toEqual([goerliMessage]);
  });
  it('Fetches messages using provider for recipient address', async () => {
    const messages = await fetchMessagesFromPiChain(goerliConfigNoExplorer, recipientAddress);
    const testMsg = messages.find((m) => m.msgId === msgId);
    expect([testMsg]).toEqual([goerliMessage]);
  });
  it('Throws error for invalid input', async () => {
    await expect(
      fetchMessagesFromPiChain(goerliConfigWithExplorer, 'invalidInput'),
    ).rejects.toThrow();
  });
});
