import { fromBase64, toBase64 } from '@hyperlane-xyz/utils';
import { z } from 'zod';

import type { MessageStub } from '../../types';

// Keep the old Message shape so existing links still supply useful lookup hints.
// Zod strips all other fields, including the body and delivery status.
const MessageLookupDataSchema = z.object({
  originDomainId: z.number().int().min(0).max(0xffffffff),
  origin: z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
});

export type MessageLookupData = z.infer<typeof MessageLookupDataSchema>;

export function parseMessageLookupData(data?: string): MessageLookupData | undefined {
  if (!data) return undefined;
  const result = MessageLookupDataSchema.safeParse(fromBase64<unknown>(data));
  return result.success ? result.data : undefined;
}

export function serializeMessageLookupData(message: MessageLookupData): string | undefined {
  const result = MessageLookupDataSchema.safeParse(message);
  return result.success ? toBase64(result.data) : undefined;
}

export function getMessageDetailPath(
  message: Pick<MessageStub, 'msgId' | 'isPiMsg' | 'originDomainId' | 'origin'>,
) {
  const data = message.isPiMsg ? serializeMessageLookupData(message) : undefined;
  return `/message/${message.msgId}${data ? `?data=${encodeURIComponent(data)}` : ''}`;
}
