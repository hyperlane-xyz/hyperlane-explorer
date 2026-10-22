import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';

import { MessageStatus, type MessageStub } from '../../types';
import { useExplorerBlockHead } from './queries/ExplorerEventsProvider';

export interface ConfirmationProgress {
  current: number | null;
  required: number;
}

export function isWaitingForOriginConfirmations(
  message: Pick<MessageStub, 'isProvisional' | 'status'>,
  progress?: ConfirmationProgress | null,
) {
  return (
    message.status === MessageStatus.Pending &&
    !!message.isProvisional &&
    (!progress || progress.current === null || progress.current < progress.required)
  );
}

export function useConfirmationProgress(
  message: MessageStub,
  chainMetadataResolver: ChainMetadataResolver,
): ConfirmationProgress | null {
  const tracking = message.isProvisional;
  const required = tracking
    ? getRequiredConfirmations(
        chainMetadataResolver.tryGetChainMetadata(message.originDomainId)?.blocks,
      )
    : undefined;
  const head = useExplorerBlockHead(required ? message.originDomainId : undefined);
  if (required === undefined) return null;
  return {
    required,
    current: calculateConfirmationCount(
      message.origin.blockNumber,
      head ? Number(head.headHeight) : undefined,
      required,
    ),
  };
}

export function calculateConfirmationCount(
  blockNumber: number | undefined,
  currentBlockNumber: number | null | undefined,
  required: number,
) {
  if (required === 0) return 0;
  if (blockNumber === undefined || currentBlockNumber == null) return null;
  return Math.min(required, Math.max(0, currentBlockNumber - blockNumber));
}

export function getRequiredConfirmations(blocks?: {
  confirmations: number;
  reorgPeriod?: number | string;
}) {
  if (typeof blocks?.reorgPeriod === 'number') return blocks.reorgPeriod;
  if (typeof blocks?.reorgPeriod === 'string') return undefined;
  return blocks?.confirmations;
}
