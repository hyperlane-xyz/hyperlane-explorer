import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { useContext } from 'react';

import { MessageStatus, type MessageStub } from '../../types';
import { ExplorerBlockHeadsContext } from './queries/ExplorerEventsProvider';

export interface ConfirmationProgress {
  current: number | null;
  required: number;
}

export function isWaitingForOriginConfirmations(
  message: Pick<MessageStub, 'isProvisional' | 'status'>,
  progress?: ConfirmationProgress | null,
) {
  return (
    message.status !== MessageStatus.Delivered &&
    !!message.isProvisional &&
    (!progress || progress.current === null || progress.current < progress.required)
  );
}

export function useConfirmationProgress(
  message: MessageStub,
  chainMetadataResolver: ChainMetadataResolver,
): ConfirmationProgress | null {
  const blockHeads = useContext(ExplorerBlockHeadsContext);
  if (!message.isProvisional || message.status === MessageStatus.Delivered) return null;
  const required = getRequiredConfirmations(
    chainMetadataResolver.tryGetChainMetadata(message.originDomainId)?.blocks,
  );
  if (required === undefined) return null;
  const head = blockHeads.get(message.originDomainId);
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
  if (blocks?.reorgPeriod === 'finalized') return 0;
  if (typeof blocks?.reorgPeriod === 'string') return undefined;
  return blocks?.confirmations;
}
