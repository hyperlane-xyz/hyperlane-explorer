import { ComponentProps } from 'react';

import { ChainLogo as ChainLogoInner } from '@hyperlane-xyz/widgets';

import { getChainName } from '../../features/chains/utils';
import { useMultiProvider } from '../../features/providers/multiProvider';

// TODO widget lib for new chainid type
type Props = Omit<ComponentProps<typeof ChainLogoInner>, 'chainId'> & { chainId: number | string };

export function ChainLogo(props: Props) {
  const { chainName, chainId, ...rest } = props;
  const multiProvider = useMultiProvider();
  const name = chainName || getChainName(multiProvider, props.chainId);
  const chainIdNumber = typeof chainId === 'number' ? chainId : undefined;
  return <ChainLogoInner {...rest} chainName={name} chainId={chainIdNumber} />;
}
