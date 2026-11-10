import { formatMessage, messageId } from '@hyperlane-xyz/utils';

import { MessageStatus, type MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { getMessageEncoding } from './messageEncoding';

const message: MessageStub = {
  id: '1',
  msgId: '',
  nonce: 42,
  sender: `0x${'11'.repeat(20)}`,
  recipient: `0x${'22'.repeat(32)}`,
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 2,
  destinationDomainId: 2,
  body: '0x1234',
  status: MessageStatus.Pending,
  origin: { hash: '', timestamp: 0 },
};

test.each([0, 3, 255])(
  'recovers version %s and every Solidity message field from the ID',
  (version) => {
    const raw = formatMessage(version, 42, 1, message.sender, 2, message.recipient, message.body);
    expect(getMessageEncoding({ ...message, msgId: messageId(raw) })).toEqual({
      raw,
      version,
      nonce: 42,
      origin: 1,
      destination: 2,
      sender: `0x${'00'.repeat(12)}${'11'.repeat(20)}`,
      recipient: message.recipient,
      body: message.body,
    });
  },
);

test('does not claim a version or raw encoding when the fields do not match the message ID', () => {
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  try {
    expect(getMessageEncoding({ ...message, msgId: `0x${'ff'.repeat(32)}` })).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Encoded message does not match message ID',
      expect.any(String),
    );
    expect(getMessageEncoding({ ...message, originDomainId: -1 })).toBeUndefined();
  } finally {
    warn.mockRestore();
  }
});
