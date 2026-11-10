import { formatMessage, messageId, parseMessage } from '@hyperlane-xyz/utils';

import { MAILBOX_VERSION } from '../../consts/mailbox';
import type { MessageStub } from '../../types';
import { logger } from '../../utils/logger';

/** The index omits version. Recover it only when the encoded message matches its ID. */
export function getMessageEncoding(message: MessageStub) {
  try {
    const encoded = formatMessage(
      MAILBOX_VERSION,
      message.nonce,
      message.originDomainId,
      message.sender,
      message.destinationDomainId,
      message.recipient,
      message.body,
    );
    const matches = (raw: string) => messageId(raw).toLowerCase() === message.msgId.toLowerCase();
    if (matches(encoded)) return { raw: encoded, ...parseMessage(encoded) };
    // Solidity's version is uint8; try other versions only when the current one mismatches.
    for (let version = 0; version < 256; version++) {
      if (version === MAILBOX_VERSION) continue;
      const raw = `0x${version.toString(16).padStart(2, '0')}${encoded.slice(4)}`;
      if (matches(raw)) return { raw, ...parseMessage(raw) };
    }
    logger.warn('Encoded message does not match message ID', message.msgId);
  } catch (error) {
    logger.warn('Error encoding message', error);
  }
  return undefined;
}
