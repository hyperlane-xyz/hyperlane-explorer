import {
  IInterchainGasPaymaster__factory as IgpFactory,
  Mailbox__factory as MailboxFactory,
} from '@hyperlane-xyz/core';
import type { IRegistry } from '@hyperlane-xyz/registry';
import { chainAddresses, chainMetadata } from '@hyperlane-xyz/registry';
import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import {
  addressToBytes32,
  formatMessage,
  messageId,
  normalizeAddress,
  toBase64,
} from '@hyperlane-xyz/utils';
import type { providers } from 'ethers';

import { Message, MessageStatus } from '../../../types';
import { logger } from '../../../utils/logger';
import type { ExplorerMultiProvider } from '../../hyperlane/sdkRuntime';
import { parseMessageLookupData } from '../messageLookup';
import { fetchMessagesFromPiChain, PiMessageQuery, PiQueryType } from './fetchPiChainMessages';

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
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

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

  it('reopens a historical message from a receipt hint without a recent log scan', async () => {
    const provider = createProvider({ head: blockNumber + 6000 });
    await expect(fetch({ input: msgId }, PiQueryType.MsgId, provider)).resolves.toEqual([]);
    jest.mocked(provider.getLogs).mockClear();

    const lookup = parseMessageLookupData(
      toBase64({
        ...expectedMessage,
        body: '0xbad',
        status: MessageStatus.Delivered,
        recipient: senderAddress,
        destination: { hash: 'forged', blockNumber: 1 },
      }),
    )!;
    await expect(
      fetch({ input: msgId, transactionHash: lookup.origin.hash }, PiQueryType.MsgId, provider),
    ).resolves.toEqual([expectedMessage]);
    expect(provider.getLogs).not.toHaveBeenCalled();
  });

  it('selects the requested dispatch from a multi-message receipt', async () => {
    const bytes = formatMessage(
      0,
      expectedMessage.nonce + 1,
      sepoliaConfig.domainId,
      senderAddress,
      destinationDomain,
      recipientAddress,
      '0x1234',
    );
    const secondLog = {
      ...baseLog,
      ...mailbox.encodeEventLog(mailbox.getEvent('Dispatch'), [
        senderAddress,
        destinationDomain,
        addressToBytes32(recipientAddress),
        bytes,
      ]),
      logIndex: 2,
    };
    const secondMsgId = messageId(bytes);
    const provider = createProvider({ receiptLogs: [dispatchLog, secondLog] });
    const messages = await fetch(
      { input: secondMsgId, transactionHash: txHash },
      PiQueryType.MsgId,
      provider,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ msgId: secondMsgId, body: '0x1234' });
    expect(provider.getLogs).not.toHaveBeenCalled();

    // The ordinary message-ID fallback must also filter the full receipt.
    const fallbackProvider = createProvider({ receiptLogs: [secondLog, dispatchLog] });
    await expect(fetch({ input: msgId }, PiQueryType.MsgId, fallbackProvider)).resolves.toEqual([
      expectedMessage,
    ]);
  });

  it('rejects a receipt that does not contain the URL message ID', async () => {
    await expect(
      fetch({ input: `0x${'ff'.repeat(32)}`, transactionHash: txHash }, PiQueryType.MsgId),
    ).resolves.toEqual([]);
  });

  it('falls back to the message-ID scan when a receipt hint is not found', async () => {
    await expect(
      fetch({ input: msgId, transactionHash: `0x${'ff'.repeat(32)}` }, PiQueryType.MsgId),
    ).resolves.toEqual([expectedMessage]);
  });

  it('falls back when the hinted receipt request throws', async () => {
    const provider = createProvider();
    const getReceipt = jest.mocked(provider.getTransactionReceipt).getMockImplementation()!;
    const badHint = `0x${'ff'.repeat(32)}`;
    jest
      .mocked(provider.getTransactionReceipt)
      .mockImplementation((hash) =>
        hash === badHint ? Promise.reject(new Error('receipt unavailable')) : getReceipt(hash),
      );
    await expect(
      fetch({ input: msgId, transactionHash: badHint }, PiQueryType.MsgId, provider),
    ).resolves.toEqual([expectedMessage]);
    expect(provider.getLogs).toHaveBeenCalled();
  });

  it('gives the ordinary lookup its full budget after a hint times out', async () => {
    jest.useFakeTimers();
    const provider = createProvider();
    const getReceipt = jest.mocked(provider.getTransactionReceipt).getMockImplementation()!;
    const getLogs = jest.mocked(provider.getLogs).getMockImplementation()!;
    const badHint = `0x${'ff'.repeat(32)}`;
    jest
      .mocked(provider.getTransactionReceipt)
      .mockImplementation((hash) => (hash === badHint ? new Promise(() => {}) : getReceipt(hash)));
    jest.mocked(provider.getLogs).mockImplementation(async (filter) => {
      await new Promise((resolve) => setTimeout(resolve, 9_000));
      return getLogs(filter);
    });
    const result = fetch({ input: msgId, transactionHash: badHint }, PiQueryType.MsgId, provider);
    const assertion = expect(result).resolves.toEqual([expectedMessage]);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(provider.getLogs).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(9_000);
    await assertion;
  });

  it('reports a timeout when the ordinary receipt lookup never completes', async () => {
    jest.useFakeTimers();
    const provider = createProvider();
    jest.mocked(provider.getTransactionReceipt).mockImplementation(() => new Promise(() => {}));
    const assertion = expect(
      fetch({ input: txHash }, PiQueryType.TxHash, provider),
    ).rejects.toThrow('message search timeout');
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('falls back when a real hinted receipt contains only a different message', async () => {
    const provider = createProvider();
    const getReceipt = jest.mocked(provider.getTransactionReceipt).getMockImplementation()!;
    const wrongHint = `0x${'ff'.repeat(32)}`;
    const wrongBytes = formatMessage(
      0,
      1,
      sepoliaConfig.domainId,
      senderAddress,
      destinationDomain,
      recipientAddress,
      '0x1234',
    );
    const wrongLog = {
      ...baseLog,
      ...mailbox.encodeEventLog(mailbox.getEvent('Dispatch'), [
        senderAddress,
        destinationDomain,
        addressToBytes32(recipientAddress),
        wrongBytes,
      ]),
      transactionHash: wrongHint,
    };
    jest.mocked(provider.getTransactionReceipt).mockImplementation(async (hash) => {
      const receipt = await getReceipt(hash === wrongHint ? txHash : hash);
      return hash === wrongHint ? { ...receipt, logs: [wrongLog] } : receipt;
    });
    await expect(
      fetch({ input: msgId, transactionHash: wrongHint }, PiQueryType.MsgId, provider),
    ).resolves.toEqual([expectedMessage]);
    expect(provider.getLogs).toHaveBeenCalled();
  });

  it('keeps the selected message if optional IGP lookup rejects for a multi-dispatch receipt', async () => {
    const receiptLogs = [
      dispatchLog,
      ...[1, 2, 3, 4].map((offset) => ({
        ...baseLog,
        ...mailbox.encodeEventLog(mailbox.getEvent('Dispatch'), [
          senderAddress,
          destinationDomain,
          addressToBytes32(recipientAddress),
          formatMessage(
            0,
            expectedMessage.nonce + offset,
            sepoliaConfig.domainId,
            senderAddress,
            destinationDomain,
            recipientAddress,
            '0x1234',
          ),
        ]),
        logIndex: offset * 2,
      })),
    ];
    mockIgpQuery(Promise.reject(new Error('gas payments unavailable')));
    await expect(
      fetchMessagesFromPiChain(
        { ...sepoliaConfig, interchainGasPaymaster: senderAddress },
        { input: msgId },
        createMultiProvider(createProvider({ receiptLogs })),
        {} as IRegistry,
        PiQueryType.MsgId,
      ),
    ).resolves.toEqual([expectedMessage]);
  });

  it('keeps a verified historical message when optional IGP lookup times out', async () => {
    jest.useFakeTimers();
    mockIgpQuery(new Promise(() => {}));
    const result = fetchMessagesFromPiChain(
      { ...sepoliaConfig, interchainGasPaymaster: senderAddress },
      { input: msgId, transactionHash: txHash },
      createMultiProvider(createProvider({ head: blockNumber + 6_000 })),
      {} as IRegistry,
      PiQueryType.MsgId,
    );
    const assertion = expect(result).resolves.toEqual([expectedMessage]);
    await jest.advanceTimersByTimeAsync(2_000);
    await assertion;
  });

  it('enriches a verified message when optional IGP lookup succeeds', async () => {
    mockIgpQuery(Promise.resolve([{ args: { gasAmount: '100', payment: '200' } }]));
    await expect(
      fetchMessagesFromPiChain(
        { ...sepoliaConfig, interchainGasPaymaster: senderAddress },
        { input: msgId, transactionHash: txHash },
        createMultiProvider(createProvider()),
        {} as IRegistry,
        PiQueryType.MsgId,
      ),
    ).resolves.toEqual([
      { ...expectedMessage, totalGasAmount: '100', totalPayment: '200', numPayments: 1 },
    ]);
  });

  it('rejects an unverifiable receipt and warns when no mailbox is configured', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    await expect(
      fetchMessagesFromPiChain(
        chainMetadata.sepolia,
        { input: txHash },
        createMultiProvider(createProvider()),
        { getChainAddresses: async () => undefined } as unknown as IRegistry,
        PiQueryType.TxHash,
      ),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no mailbox address'));
  });

  it.each([PiQueryType.MsgId, PiQueryType.TxHash])(
    'rejects dispatch events from an unrelated contract in a %s lookup',
    async (queryType) => {
      const provider = createProvider({
        receiptLogs: [{ ...dispatchLog, address: senderAddress }],
      });
      await expect(
        fetch(
          { input: queryType === PiQueryType.MsgId ? msgId : txHash, transactionHash: txHash },
          queryType,
          provider,
        ),
      ).resolves.toEqual([]);
    },
  );

  it('rejects dispatches whose origin domain does not match the queried chain', async () => {
    const bytes = formatMessage(
      0,
      1,
      sepoliaConfig.domainId + 1,
      senderAddress,
      destinationDomain,
      recipientAddress,
      '0x',
    );
    const provider = createProvider({
      receiptLogs: [
        {
          ...baseLog,
          ...mailbox.encodeEventLog(mailbox.getEvent('Dispatch'), [
            senderAddress,
            destinationDomain,
            addressToBytes32(recipientAddress),
            bytes,
          ]),
        },
      ],
    });
    await expect(
      fetch({ input: messageId(bytes), transactionHash: txHash }, PiQueryType.MsgId, provider),
    ).resolves.toEqual([]);
  });

  it('uses the resolved mailbox when chain metadata does not embed its address', async () => {
    const provider = createProvider();
    const multiProvider = createMultiProvider(provider);
    const registry = {
      getChainAddresses: jest.fn(async () => ({ mailbox: sepoliaMailbox })),
    } as unknown as IRegistry;
    await expect(
      fetchMessagesFromPiChain(
        chainMetadata.sepolia,
        { input: msgId, transactionHash: txHash },
        multiProvider,
        registry,
        PiQueryType.MsgId,
      ),
    ).resolves.toEqual([expectedMessage]);
  });
});

function mockIgpQuery(result: Promise<unknown>) {
  jest.spyOn(IgpFactory, 'connect').mockReturnValue({
    filters: { GasPayment: () => ({}) },
    queryFilter: () => result,
  } as unknown as ReturnType<typeof IgpFactory.connect>);
}

function createMultiProvider(provider: providers.Provider) {
  return {
    getChainId: () => sepoliaConfig.chainId,
    getEthersV5Provider: () => provider,
    tryGetChainId: () => destinationDomain,
  } as unknown as ExplorerMultiProvider;
}

function fetch(query: PiMessageQuery, queryType?: PiQueryType, provider = createProvider()) {
  return fetchMessagesFromPiChain(
    sepoliaConfig,
    query,
    createMultiProvider(provider),
    {} as IRegistry,
    queryType,
  );
}

function createProvider({
  head = blockNumber,
  receiptLogs = [dispatchLog],
}: { head?: number; receiptLogs?: providers.Log[] } = {}) {
  return {
    getBlock: jest.fn(async () => ({ timestamp })),
    getBlockNumber: jest.fn(async () => head),
    getLogs: jest.fn(async (filter: providers.Filter) => {
      if (Number(filter.fromBlock) > blockNumber) return [];
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
            logs: receiptLogs,
            to: sepoliaMailbox,
          }
        : null,
    ),
  } as unknown as providers.Provider;
}

function matchesTopics(logTopics: string[], filterTopics: providers.Filter['topics']) {
  return (filterTopics ?? []).every((topic, index) => topic === null || topic === logTopics[index]);
}
