import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import type { WarpRouteConfigs } from '@hyperlane-xyz/sdk/warp/read';
import type { WarpCoreConfig } from '@hyperlane-xyz/sdk/warp/types';

import { isCrossCollateralTokenStandard } from './tokenStandards';
import { getWarpRouteTokenKey, hasRouteEnrollments } from './types';
import { findWarpRouteConfig, isCollateralTokenStandard } from './useWarpRouteVisualization';

const ETH_USDC = '0xA9C9a8FB36Ce3e5ffBAC3757dA7141262723541F';
const ETH_USDT = '0xeB1b48b238E15A62e1858a601B6BfFdf41163AE3';
const SOL_XO = 'HW9NfLGo6YMoM6o5auTvn5h26tWJPpsroUDfGFwvsQsU';

function route(tokens: WarpCoreConfig['tokens']): WarpCoreConfig {
  return { tokens };
}

function token(
  chainName: string,
  addressOrDenom: string,
  standard: TokenStandard,
): WarpCoreConfig['tokens'][number] {
  return {
    chainName,
    addressOrDenom,
    standard,
    symbol: 'TEST',
    name: 'Test',
    decimals: 6,
  };
}

describe('findWarpRouteConfig', () => {
  it('prefers the specific cross-collateral sub-route when routers appear in multiple routes', () => {
    const configs: WarpRouteConfigs = {
      'CROSS/moonpay': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('ethereum', ETH_USDT, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
      'USDC/moonpay': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
    };

    const match = findWarpRouteConfig(
      configs,
      ETH_USDC.toLowerCase(),
      'ethereum',
      SOL_XO,
      'solanamainnet',
    );

    expect(match?.routeId).toBe('USDC/moonpay');
  });

  it('uses route ID as a deterministic tiebreaker for equally-sized routes', () => {
    const configs: WarpRouteConfigs = {
      'z-route': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
      'a-route': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
    };

    const match = findWarpRouteConfig(configs, ETH_USDC, 'ethereum', SOL_XO, 'solanamainnet');

    expect(match?.routeId).toBe('a-route');
  });

  it('keeps the single-token lookup path on the most specific matching route', () => {
    const configs: WarpRouteConfigs = {
      'CROSS/moonpay': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('ethereum', ETH_USDT, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
      'USDC/moonpay': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
    };

    const match = findWarpRouteConfig(configs, ETH_USDC, 'ethereum');

    expect(match?.routeId).toBe('USDC/moonpay');
  });

  it('prefers a matching warp route ID over the smallest matching config', () => {
    const configs: WarpRouteConfigs = {
      'M0/smaller': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCollateral),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypSynthetic),
      ]),
      'USDSC/mUSD/wM': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCollateral),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypSynthetic),
        token('ethereum', ETH_USDT, TokenStandard.EvmHypCollateral),
      ]),
    };

    const match = findWarpRouteConfig(
      configs,
      ETH_USDC,
      'ethereum',
      SOL_XO,
      'solanamainnet',
      'USDSC/mUSD/wM',
    );

    expect(match?.routeId).toBe('USDSC/mUSD/wM');
  });

  it('falls back when the preferred warp route ID does not match the transfer', () => {
    const configs: WarpRouteConfigs = {
      'unrelated-route': route([token('ethereum', ETH_USDT, TokenStandard.EvmHypCollateral)]),
      'USDC/moonpay': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCrossCollateralRouter),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypCrossCollateral),
      ]),
    };

    const match = findWarpRouteConfig(
      configs,
      ETH_USDC,
      'ethereum',
      SOL_XO,
      'solanamainnet',
      'unrelated-route',
    );

    expect(match?.routeId).toBe('USDC/moonpay');
  });

  it('uses a destination chain filter even without a destination token address', () => {
    const configs: WarpRouteConfigs = {
      'ethereum-only': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCollateral),
        token('ethereum', ETH_USDT, TokenStandard.EvmHypSynthetic),
      ]),
      'ethereum-solana': route([
        token('ethereum', ETH_USDC, TokenStandard.EvmHypCollateral),
        token('solanamainnet', SOL_XO, TokenStandard.SealevelHypSynthetic),
      ]),
    };

    const match = findWarpRouteConfig(configs, ETH_USDC, 'ethereum', undefined, 'solanamainnet');

    expect(match?.routeId).toBe('ethereum-solana');
  });
});

describe('getWarpRouteTokenKey', () => {
  it('keeps same-chain sibling token balances distinct', () => {
    expect(
      getWarpRouteTokenKey({
        chainName: 'ethereum',
        addressOrDenom: ETH_USDC,
      }),
    ).not.toBe(
      getWarpRouteTokenKey({
        chainName: 'ethereum',
        addressOrDenom: ETH_USDT,
      }),
    );
  });
});

describe('isCollateralTokenStandard', () => {
  it('treats cross-collateral routers as collateral-backed', () => {
    expect(isCollateralTokenStandard(TokenStandard.EvmHypCrossCollateralRouter)).toBe(true);
    expect(isCollateralTokenStandard(TokenStandard.SealevelHypCrossCollateral)).toBe(true);
    expect(isCollateralTokenStandard(TokenStandard.TronHypCrossCollateralRouter)).toBe(true);
  });
});

describe('isCrossCollateralTokenStandard', () => {
  it('detects cross-collateral standards without importing UI components', () => {
    expect(isCrossCollateralTokenStandard(TokenStandard.EvmHypCrossCollateralRouter)).toBe(true);
    expect(isCrossCollateralTokenStandard(TokenStandard.EvmHypCollateral)).toBe(false);
  });
});

describe('hasRouteEnrollments', () => {
  it('detects enrollments on non-cross-collateral routes', () => {
    expect(
      hasRouteEnrollments({
        routeId: 'normal-route',
        config: route([]),
        tokens: [
          {
            chainName: 'ethereum',
            addressOrDenom: ETH_USDC,
            standard: TokenStandard.EvmHypCollateral,
            symbol: 'USDC',
            decimals: 6,
            enrollments: [
              {
                chainName: 'solanamainnet',
                addressOrDenom: SOL_XO,
                symbol: 'XO',
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
});
