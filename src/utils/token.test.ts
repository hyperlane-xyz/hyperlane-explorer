import { TokenStandard, type ChainMetadata } from '@hyperlane-xyz/sdk';
import type { WarpRouteChainAddressMap } from '@hyperlane-xyz/sdk/warp/read';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { getTokenFromWarpRouteChainAddressMap } from './token';

const buildToken = (chainName: string, addressOrDenom: string, symbol = 'TOKEN') => ({
  chainName,
  standard: TokenStandard.EvmHypSynthetic,
  addressOrDenom,
  decimals: 18,
  symbol,
  name: symbol,
  wireDecimals: 18,
});

describe('getTokenFromWarpRouteChainAddressMap', () => {
  it('matches EVM addresses regardless of checksum casing', () => {
    const checksumAddress = '0x647C621CEb36853Ef6A907E397Adf18568E70543';
    const lowerAddress = checksumAddress.toLowerCase();
    const metadata = {
      name: 'ethereum',
      protocol: ProtocolType.Ethereum,
    } as ChainMetadata;
    const warpRouteChainAddressMap: WarpRouteChainAddressMap = {
      ethereum: {
        [checksumAddress]: buildToken('ethereum', checksumAddress, 'USDT'),
      },
    };

    const result = getTokenFromWarpRouteChainAddressMap(
      metadata,
      lowerAddress,
      warpRouteChainAddressMap,
    );

    expect(result?.symbol).toBe('USDT');
  });

  it('keeps suffix fallback for non-address denom keys', () => {
    const denom = 'factory/neutron1dvzvf870mx9uf65uqhx40yzx9gu4xlqqq2pnx362a0ndmustww3smumrf5/eclip';
    const metadata = {
      name: 'neutron',
      protocol: ProtocolType.Cosmos,
    } as ChainMetadata;
    const warpRouteChainAddressMap: WarpRouteChainAddressMap = {
      neutron: {
        [denom]: buildToken('neutron', denom, 'ECLIP'),
      },
    };

    const result = getTokenFromWarpRouteChainAddressMap(
      metadata,
      'eclip',
      warpRouteChainAddressMap,
    );

    expect(result?.symbol).toBe('ECLIP');
  });
});
