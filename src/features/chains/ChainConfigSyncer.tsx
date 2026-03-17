import { PropsWithChildren } from 'react';

import { useQueryParamChainConfigSync } from './useChainMetadata';

export function ChainConfigSyncEffect() {
  useQueryParamChainConfigSync();
  return null;
}

export function ChainConfigSyncer({ children }: PropsWithChildren<Record<never, any>>) {
  useQueryParamChainConfigSync();
  return <>{children}</>;
}
