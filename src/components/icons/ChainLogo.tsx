import { ChainLogo as ChainLogoInner } from '@hyperlane-xyz/widgets';

import { useRegistry } from '../../store';

export function ChainLogo({
  chainName,
  background,
  size,
}: {
  chainName?: string;
  background?: boolean;
  size?: number;
}) {
  const registry = useRegistry();
  const name = chainName || '';
  return (
    <ChainLogoInner chainName={name} registry={registry} size={size} background={background} />
  );
}
