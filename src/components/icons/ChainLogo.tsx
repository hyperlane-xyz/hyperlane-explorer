import { ChainLogo as ChainLogoInner } from '@ortege/widgets';
import { ComponentProps } from 'react';

import { getChainName } from '../../features/chains/utils';
import { useMultiProvider } from '../../features/providers/multiProvider';

export function ChainLogo(props: ComponentProps<typeof ChainLogoInner>) {
  const { chainName, ...rest } = props;
  const multiProvider = useMultiProvider();
  const name = chainName || getChainName(multiProvider, props.chainId);
  return <ChainLogoInner {...rest} chainName={name} />;
}
