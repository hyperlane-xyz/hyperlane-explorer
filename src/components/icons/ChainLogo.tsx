import { ChainLogo as ChainLogoInner } from '@hyperlane-xyz/widgets';

import { useMultiProvider, useRegistry } from '../../store';

export function ChainLogo({
  chainId,
  chainName,
  background,
  size,
}: {
  chainId: ChainId;
  chainName?: string;
  background?: boolean;
  size?: number;
}) {
  const multiProvider = useMultiProvider();
  const registry = useRegistry();
  const name = chainName || multiProvider.tryGetChainName(chainId) || '';
  return (
    <ChainLogoInner chainName={name} registry={registry} size={size} background={background} />
  );
}
