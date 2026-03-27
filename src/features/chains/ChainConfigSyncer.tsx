import { useQueryParamChainConfigSync } from './useChainMetadata';

export function ChainConfigSyncEffect() {
  useQueryParamChainConfigSync();
  return null;
}
