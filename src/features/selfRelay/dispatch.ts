import { HyperlaneCore, type DispatchedMessage } from '@hyperlane-xyz/sdk';
import { eqAddressEvm } from '@hyperlane-xyz/utils';
import type { providers } from 'ethers';

export function findMailboxDispatchedMessage(
  receipt: providers.TransactionReceipt,
  mailboxAddress: string,
  messageId: string,
): DispatchedMessage | undefined {
  const mailboxReceipt = {
    ...receipt,
    logs: receipt.logs.filter((log) => eqAddressEvm(log.address, mailboxAddress)),
  };

  return HyperlaneCore.getDispatchedMessages(mailboxReceipt).find(
    (message) => message.id.toLowerCase() === messageId.toLowerCase(),
  );
}
