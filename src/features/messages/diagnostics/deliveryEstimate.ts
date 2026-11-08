import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';

import type { OriginConfirmation } from './useOriginConfirmation';

type Confirmation = Pick<OriginConfirmation, 'confirmed' | 'current' | 'required'>;

export function estimateConfirmationSeconds(
  progress: Confirmation | undefined,
  blockTime: number | undefined,
): number | undefined {
  if (progress?.confirmed || blockTime == null || !Number.isFinite(blockTime) || blockTime <= 0)
    return undefined;
  const { current, required } = progress ?? {};
  if (
    current == null ||
    required == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(required) ||
    current < 0 ||
    required < 0
  )
    return undefined;
  const seconds = Math.max(0, required - current) * blockTime;
  return Number.isFinite(seconds) ? seconds : undefined;
}

/** Same metadata estimate as Nexus; relayer pickup can precede origin finality. */
export function estimateDeliverySeconds(
  blocks: ChainMetadata['blocks'],
  origin?: Confirmation,
  relaying = false,
): number | undefined {
  const blockTime = blocks?.estimateBlockTime;
  const confirmations =
    typeof blocks?.reorgPeriod === 'number' ? blocks.reorgPeriod : blocks?.confirmations;
  if (
    blockTime == null ||
    !Number.isFinite(blockTime) ||
    blockTime <= 0 ||
    confirmations == null ||
    !Number.isFinite(confirmations) ||
    confirmations < 0
  )
    return undefined;
  const originSeconds =
    relaying || origin?.confirmed
      ? 0
      : (estimateConfirmationSeconds(origin, blockTime) ?? confirmations * blockTime);
  const seconds = originSeconds + 5;
  return Number.isFinite(seconds) ? seconds : undefined;
}

export function formatEstimatedTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid estimated duration');
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `~${Math.floor(seconds / 60)} min`;
  return `~${Math.floor(seconds / 3600)} hr`;
}
