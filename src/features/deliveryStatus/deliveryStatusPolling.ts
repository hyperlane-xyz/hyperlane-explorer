import type { ExplorerConnectionState } from '../messages/queries/useLiveMessages';

export function shouldUseDeliveryStatusPolling(
  isPiMsg: boolean | undefined,
  connectionState: ExplorerConnectionState,
) {
  return !!isPiMsg || connectionState !== 'connected';
}
