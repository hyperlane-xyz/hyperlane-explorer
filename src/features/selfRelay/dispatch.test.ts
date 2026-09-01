import { Mailbox__factory } from '@hyperlane-xyz/core';
import { addressToBytes32, formatMessage, messageId } from '@hyperlane-xyz/utils';
import { BigNumber, type providers } from 'ethers';

import { findMailboxDispatchedMessage } from './dispatch';

const MAILBOX = '0x1111111111111111111111111111111111111111';
const OTHER_CONTRACT = '0x2222222222222222222222222222222222222222';
const SENDER = '0x3333333333333333333333333333333333333333';
const RECIPIENT = '0x4444444444444444444444444444444444444444';
const ORIGIN = 1;
const DESTINATION = 2;

function createReceipt(logAddress: string): providers.TransactionReceipt {
  const rawMessage = formatMessage(3, 0, ORIGIN, SENDER, DESTINATION, RECIPIENT, '0x1234');
  const mailbox = Mailbox__factory.createInterface();
  const encoded = mailbox.encodeEventLog(mailbox.getEvent('Dispatch'), [
    SENDER,
    DESTINATION,
    addressToBytes32(RECIPIENT),
    rawMessage,
  ]);

  return {
    to: MAILBOX,
    from: SENDER,
    contractAddress: '0x0000000000000000000000000000000000000000',
    transactionIndex: 0,
    gasUsed: BigNumber.from(1),
    logsBloom: `0x${'00'.repeat(256)}`,
    blockHash: `0x${'11'.repeat(32)}`,
    transactionHash: `0x${'22'.repeat(32)}`,
    logs: [
      {
        blockNumber: 1,
        blockHash: `0x${'11'.repeat(32)}`,
        transactionIndex: 0,
        removed: false,
        address: logAddress,
        data: encoded.data,
        topics: encoded.topics,
        transactionHash: `0x${'22'.repeat(32)}`,
        logIndex: 0,
      },
    ],
    blockNumber: 1,
    confirmations: 1,
    cumulativeGasUsed: BigNumber.from(1),
    effectiveGasPrice: BigNumber.from(1),
    byzantium: true,
    type: 2,
    status: 1,
  };
}

describe('findMailboxDispatchedMessage', () => {
  it('accepts a dispatch emitted by the configured Mailbox', () => {
    const receipt = createReceipt(MAILBOX);
    const expectedId = messageId(
      formatMessage(3, 0, ORIGIN, SENDER, DESTINATION, RECIPIENT, '0x1234'),
    );

    expect(findMailboxDispatchedMessage(receipt, MAILBOX, expectedId)?.id).toBe(expectedId);
  });

  it('rejects a Dispatch-shaped event emitted by another contract', () => {
    const receipt = createReceipt(OTHER_CONTRACT);
    const expectedId = messageId(
      formatMessage(3, 0, ORIGIN, SENDER, DESTINATION, RECIPIENT, '0x1234'),
    );

    expect(findMailboxDispatchedMessage(receipt, MAILBOX, expectedId)).toBeUndefined();
  });
});
