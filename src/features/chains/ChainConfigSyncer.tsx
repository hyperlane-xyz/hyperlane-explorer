import { PropsWithChildren } from 'react';

import { useQueryParamChainConfigSync } from './useChainConfigs';

export function ChainConfigSyncer({ children }: PropsWithChildren<Record<never, any>>) {
  useQueryParamChainConfigSync();
  return <>{children}</>;
}
