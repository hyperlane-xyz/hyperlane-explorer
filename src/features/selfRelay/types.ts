import { z } from 'zod';

type Hex = `0x${string}`;

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const hexSchema = z.custom<Hex>(
  (value) => typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value),
);
const addressSchema = z.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value),
);

export const SelfRelayPrepareRequestSchema = z
  .object({
    messageId: hashSchema,
    originDomainId: z.number().int().nonnegative(),
    originTxHash: hashSchema,
  })
  .strict();

export type SelfRelayPrepareRequest = z.infer<typeof SelfRelayPrepareRequestSchema>;

export const SelfRelayPrepareResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('delivered') }),
  z.object({
    status: z.literal('ready'),
    destinationChainId: z.number().int().positive(),
    destinationChainName: z.string().min(1),
    mailboxAddress: addressSchema,
    calldata: hexSchema,
  }),
  z.object({ status: z.literal('error'), error: z.string().min(1) }),
]);

export type SelfRelayPrepareResponse = z.infer<typeof SelfRelayPrepareResponseSchema>;
