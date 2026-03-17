import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { logger } from '../../utils/logger';
import { MessageSearch } from './MessageSearch';
import { prefetchMessageDetailShell } from './navigationPrefetch';

const ChainConfigSyncEffect = dynamic(
  () => import('../chains/ChainConfigSyncer').then((mod) => mod.ChainConfigSyncEffect),
  { ssr: false },
);

export function MessageSearchPage() {
  useEffect(() => {
    const preload = () => {
      prefetchMessageDetailShell().catch((error) =>
        logger.debug('Error preloading message detail shell from home', error),
      );
    };

    if (typeof window === 'undefined') return;

    if ('requestIdleCallback' in window) {
      const idleWindow = window as Window &
        typeof globalThis & {
          requestIdleCallback: typeof window.requestIdleCallback;
          cancelIdleCallback: typeof window.cancelIdleCallback;
        };
      const idleId = idleWindow.requestIdleCallback(preload, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preload, 500);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return (
    <>
      <ChainConfigSyncEffect />
      <MessageSearch />
    </>
  );
}
