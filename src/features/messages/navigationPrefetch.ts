import { logger } from '../../utils/logger';

let messageDetailShellPrefetchPromise: Promise<void> | null = null;

export function prefetchMessageDetailShell() {
  if (messageDetailShellPrefetchPromise) return messageDetailShellPrefetchPromise;

  messageDetailShellPrefetchPromise = Promise.all([
    import('./MessageDetailsPage'),
    import('./MessageDetailsInner'),
    import('../chains/ChainConfigSyncer'),
  ])
    .then(() => undefined)
    .catch((error) => {
      logger.debug('Error prefetching message detail shell', error);
      messageDetailShellPrefetchPromise = null;
    });

  return messageDetailShellPrefetchPromise;
}
