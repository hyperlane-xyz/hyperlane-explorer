import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';

import type { MessageStub } from '../../../types';
import { useExplorerBlockValue } from '../queries/ExplorerEventsProvider';
import { calculateConfirmationCount, getRequiredConfirmations } from '../useConfirmationProgress';

export interface OriginConfirmation {
  blockTag?: 'safe' | 'finalized';
  timestamp?: number;
  required?: number;
  blockNumber?: number;
  current?: number | null;
  confirmed: boolean;
  tracked: boolean;
}

export function useOriginConfirmation(
  message: MessageStub,
  chainMetadataResolver: ChainMetadataResolver,
): OriginConfirmation {
  const blocks = chainMetadataResolver.tryGetChainMetadata(message.originDomainId)?.blocks;
  const required = getRequiredConfirmations(blocks);
  const blockNumber = message.origin.blockNumber;
  const provisional = message.isOriginProvisional ?? message.isProvisional;
  const tracksHead =
    provisional !== false && required !== undefined && required > 0 && blockNumber !== undefined;
  const headHeight = useExplorerBlockValue(
    tracksHead ? message.originDomainId : undefined,
    (head) =>
      head && required !== undefined && blockNumber !== undefined
        ? Math.min(blockNumber + required, Math.max(blockNumber, Number(head.headHeight)))
        : undefined,
  );
  return getOriginConfirmation(message, blocks, headHeight);
}

export function getOriginConfirmation(
  message: Pick<MessageStub, 'origin' | 'isOriginProvisional' | 'isProvisional'>,
  blocks?: ChainMetadata['blocks'],
  headHeight?: number,
): OriginConfirmation {
  const provisional = message.isOriginProvisional ?? message.isProvisional;
  const reorgPeriod = blocks?.reorgPeriod;
  const required = getRequiredConfirmations(blocks);
  const blockNumber =
    required !== undefined && message.origin.blockNumber !== undefined
      ? message.origin.blockNumber + required
      : undefined;
  // Explicit scraper state wins over a head that may predate a rollback. Delivery alone
  // is deliberately not evidence of origin maturity (fast relayers can deliver earlier).
  const confirmed =
    provisional === false ||
    (provisional === undefined &&
      required !== undefined &&
      (required === 0 ||
        (blockNumber !== undefined && headHeight !== undefined && headHeight >= blockNumber)));
  return {
    blockTag: reorgPeriod === 'safe' || reorgPeriod === 'finalized' ? reorgPeriod : undefined,
    required,
    blockNumber,
    confirmed,
    tracked:
      provisional !== undefined ||
      required === 0 ||
      (blockNumber !== undefined && headHeight !== undefined),
    current:
      required === undefined
        ? undefined
        : confirmed
          ? required
          : calculateConfirmationCount(message.origin.blockNumber, headHeight, required),
    // Block tags have no recoverable historical target; never substitute an estimate.
    timestamp:
      confirmed && required === 0 && message.origin.timestamp > 0
        ? message.origin.timestamp
        : undefined,
  };
}
