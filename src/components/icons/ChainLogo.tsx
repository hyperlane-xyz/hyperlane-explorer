import { ComponentProps } from 'react';

import { ChainLogo as ChainLogoInner } from '@hyperlane-xyz/widgets';

import { getChainName } from '../../features/chains/utils';
import { useMultiProvider } from '../../multiProvider';

export function ChainLogo(props: ComponentProps<typeof ChainLogoInner>) {
  const { chainName, ...rest } = props;
  const multiProvider = useMultiProvider();
  const name = chainName || getChainName(multiProvider, props.chainId);
  return <ChainLogoInner {...rest} chainName={name} />;
}
