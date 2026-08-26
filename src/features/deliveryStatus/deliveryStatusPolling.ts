import type { ExplorerConnectionState } from '../messages/queries/useLiveMessages';

export function shouldUseDeliveryStatusPolling(
  isPiMsg: boolean | undefined,
  connectionState: ExplorerConnectionState,
) {
  return !!isPiMsg || connectionState !== 'connected';
}

export function getDeliveryStatusRefetchInterval(
  isDelivered: boolean,
  isPiMsg: boolean | undefined,
  connectionState: ExplorerConnectionState,
) {
  return isDelivered || !shouldUseDeliveryStatusPolling(isPiMsg, connectionState) ? false : 10_000;
}
