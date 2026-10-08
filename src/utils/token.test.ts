import { TokenStandard, type ChainMetadata } from '@hyperlane-xyz/sdk';
import type { WarpRouteChainAddressMap } from '@hyperlane-xyz/sdk/warp/read';
import { ProtocolType } from '@hyperlane-xyz/utils';

import {
  findErc20TokenInWarpRouteChainAddressMap,
  getTokenFromWarpRouteChainAddressMap,
} from './token';

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
    const denom =
      'factory/neutron1dvzvf870mx9uf65uqhx40yzx9gu4xlqqq2pnx362a0ndmustww3smumrf5/eclip';
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

describe('findErc20TokenInWarpRouteChainAddressMap', () => {
  const ROUTER_A = '0x5ff3c3aaD59b590e7989092bA37F02F263DB8791';
  const ROUTER_B = '0x1234567890123456789012345678901234567890';
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const collateralToken = (
    router: string,
    collateral: string,
    coinGeckoId?: string,
    symbol = 'USDC',
  ) => ({
    chainName: 'base',
    standard: TokenStandard.EvmHypCollateral,
    addressOrDenom: router,
    collateralAddressOrDenom: collateral,
    coinGeckoId,
    decimals: 6,
    symbol,
    name: symbol,
    wireDecimals: 6,
  });

  it('matches the collateral token regardless of address casing', () => {
    const map: WarpRouteChainAddressMap = {
      base: { [ROUTER_A]: collateralToken(ROUTER_A, USDC, 'usd-coin') },
    };

    const result = findErc20TokenInWarpRouteChainAddressMap('base', USDC.toLowerCase(), map);

    expect(result?.symbol).toBe('USDC');
    expect(result?.coinGeckoId).toBe('usd-coin');
  });

  it('matches a synthetic token by its own address', () => {
    const map: WarpRouteChainAddressMap = {
      base: { [ROUTER_A]: buildToken('base', ROUTER_A, 'SYN') },
    };

    expect(findErc20TokenInWarpRouteChainAddressMap('base', ROUTER_A, map)?.symbol).toBe('SYN');
  });

  it('does not match a collateral route by its router address', () => {
    const map: WarpRouteChainAddressMap = {
      base: { [ROUTER_A]: collateralToken(ROUTER_A, USDC, 'usd-coin') },
    };

    expect(findErc20TokenInWarpRouteChainAddressMap('base', ROUTER_A, map)).toBeUndefined();
  });

  it('prefers an entry with a coinGeckoId over one without', () => {
    const map: WarpRouteChainAddressMap = {
      base: {
        [ROUTER_A]: collateralToken(ROUTER_A, USDC, undefined, 'USDC.a'),
        [ROUTER_B]: collateralToken(ROUTER_B, USDC, 'usd-coin', 'USDC.b'),
      },
    };

    expect(findErc20TokenInWarpRouteChainAddressMap('base', USDC, map)?.symbol).toBe('USDC.b');
  });

  it('falls back to an entry without a coinGeckoId', () => {
    const map: WarpRouteChainAddressMap = {
      base: { [ROUTER_A]: collateralToken(ROUTER_A, USDC) },
    };

    const result = findErc20TokenInWarpRouteChainAddressMap('base', USDC, map);

    expect(result?.symbol).toBe('USDC');
    expect(result?.coinGeckoId).toBeUndefined();
  });

  it('only searches the given chain and skips non-EVM denoms', () => {
    const map: WarpRouteChainAddressMap = {
      ethereum: { [ROUTER_A]: collateralToken(ROUTER_A, USDC, 'usd-coin') },
      base: { denom1: collateralToken('denom1', 'factory/neutron1abc/usdc', 'usd-coin') },
    };

    expect(findErc20TokenInWarpRouteChainAddressMap('base', USDC, map)).toBeUndefined();
    expect(findErc20TokenInWarpRouteChainAddressMap('arbitrum', USDC, map)).toBeUndefined();
  });
});
