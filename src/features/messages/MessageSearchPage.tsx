import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { logger } from '../../utils/logger';
import { scheduleWhenIdle } from '../../utils/scheduleWhenIdle';
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

    return scheduleWhenIdle(preload, { timeout: 1_500, fallbackDelay: 500 });
  }, []);

  return (
    <>
      <ChainConfigSyncEffect />
      <MessageSearch />
    </>
  );
}
