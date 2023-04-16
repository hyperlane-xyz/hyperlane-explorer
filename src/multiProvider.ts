import { useMemo } from 'react';

import { MultiProvider, chainMetadata } from '@hyperlane-xyz/sdk';

import { useChainConfigsWithQueryParams } from './features/chains/useChainConfigs';

export function useMultiProvider() {
  const nameToConfig = useChainConfigsWithQueryParams();
  const multiProvider = useMemo(
    () => new MultiProvider({ ...chainMetadata, ...nameToConfig }),
    [nameToConfig],
  );
  return multiProvider;
}
