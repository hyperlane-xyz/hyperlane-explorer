import {
  EvmHypCollateralAdapter,
  EvmHypNativeAdapter,
  EvmHypSyntheticAdapter,
  EvmHypVSXERC20Adapter,
  EvmHypVSXERC20LockboxAdapter,
  EvmHypXERC20Adapter,
  EvmHypXERC20LockboxAdapter,
} from '@hyperlane-xyz/sdk/token/adapters/EvmTokenAdapter';
import type { IHypTokenAdapter } from '@hyperlane-xyz/sdk/token/adapters/ITokenAdapter';
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';

import type { ExplorerMultiProvider } from '../hyperlane/sdkRuntime';

type EvmHypTokenLike = {
  chainName?: string;
  addressOrDenom?: string;
  standard?: TokenStandard | string;
};

export function createEvmHypAdapter(
  multiProvider: ExplorerMultiProvider,
  token: EvmHypTokenLike,
): IHypTokenAdapter<unknown> | undefined {
  const { chainName, addressOrDenom, standard } = token;

  if (!chainName || !addressOrDenom || !standard) {
    return undefined;
  }

  const chainMetadata = multiProvider.tryGetChainMetadata(chainName);
  if (chainMetadata?.protocol !== 'ethereum') {
    return undefined;
  }

  switch (standard) {
    case TokenStandard.EvmHypCollateral:
      return new EvmHypCollateralAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypNative:
      return new EvmHypNativeAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypSynthetic:
      return new EvmHypSyntheticAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypXERC20:
      return new EvmHypXERC20Adapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypVSXERC20:
      return new EvmHypVSXERC20Adapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypXERC20Lockbox:
      return new EvmHypXERC20LockboxAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypVSXERC20Lockbox:
      return new EvmHypVSXERC20LockboxAdapter(chainName, multiProvider, {
        token: addressOrDenom,
      });
    default:
      return undefined;
  }
}
