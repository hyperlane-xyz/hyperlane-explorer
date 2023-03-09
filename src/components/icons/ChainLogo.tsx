import { ComponentProps } from 'react';

import { ChainLogo as ChainLogoInner } from '@hyperlane-xyz/widgets';

import { getChainName } from '../../features/chains/utils';

export function ChainLogo(props: ComponentProps<typeof ChainLogoInner>) {
  const { chainName, ...rest } = props;
  const name = chainName || getChainName(props.chainId);
  return <ChainLogoInner {...rest} chainName={name} />;
}
