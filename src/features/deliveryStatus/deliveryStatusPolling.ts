import type { ExplorerConnectionState } from '../messages/queries/useLiveMessages';

export function getDeliveryStatusRefetchInterval(
  isDelivered: boolean,
  isPiMsg: boolean | undefined,
  connectionState: ExplorerConnectionState,
) {
  return !isDelivered && (isPiMsg || connectionState !== 'connected') ? 10_000 : false;
}
