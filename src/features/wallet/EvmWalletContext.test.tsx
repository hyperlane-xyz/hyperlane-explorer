/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { EvmWalletContext, useIsWalletReady } from './EvmWalletContext';

let mockMultiProvider: object | undefined;
const mockCreateConfig = jest.fn((options) => ({ options }));
const mockInjected = jest.fn(() => ({ id: 'injected' }));
const mockConnectorsForWallets = jest.fn((_wallets?: unknown, _options?: unknown) => [
  { id: 'wallet-connect' },
]);
const observedConfigs: unknown[] = [];
const observedReadiness: boolean[] = [];

jest.mock('../../consts/config', () => ({
  config: { walletConnectProjectId: undefined },
}));
jest.mock('../../store', () => ({
  useReadyMultiProvider: () => mockMultiProvider,
}));
jest.mock('@hyperlane-xyz/widgets/walletIntegrations/ethereum', () => ({
  getWagmiChainConfigs: () => [
    {
      id: 1,
      name: 'Ethereum',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.example'] } },
    },
  ],
}));
jest.mock('@rainbow-me/rainbowkit', () => ({
  RainbowKitProvider: ({ children }: { children: React.ReactNode }) => children,
  connectorsForWallets: (wallets: unknown, options: unknown) =>
    mockConnectorsForWallets(wallets, options),
  lightTheme: () => ({}),
}));
jest.mock('@rainbow-me/rainbowkit/wallets', () => ({
  injectedWallet: jest.fn(),
  metaMaskWallet: jest.fn(),
  rainbowWallet: jest.fn(),
  walletConnectWallet: jest.fn(),
}));
jest.mock('@wagmi/core', () => ({
  injected: () => mockInjected(),
}));
jest.mock('viem', () => ({
  createClient: jest.fn(),
  fallback: jest.fn(),
  http: jest.fn(),
}));
jest.mock('viem/chains', () => ({
  mainnet: {
    id: 1,
    name: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.example'] } },
  },
}));
jest.mock('wagmi', () => ({
  WagmiProvider: ({ config, children }: { config: unknown; children: React.ReactNode }) => {
    observedConfigs.push(config);
    return children;
  },
  createConfig: (options: unknown) => mockCreateConfig(options),
}));

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function ReadinessProbe() {
  observedReadiness.push(useIsWalletReady());
  return null;
}

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  mockMultiProvider = undefined;
  mockCreateConfig.mockClear();
  mockInjected.mockClear();
  mockConnectorsForWallets.mockClear();
  observedConfigs.length = 0;
  observedReadiness.length = 0;
});

it('uses injected wallets when WalletConnect is not configured', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <EvmWalletContext>
        <ReadinessProbe />
      </EvmWalletContext>,
    );
  });

  expect(mockInjected).toHaveBeenCalled();
  expect(mockConnectorsForWallets).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it('upgrades once when metadata becomes ready and ignores later provider replacements', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () =>
    root.render(
      <EvmWalletContext>
        <ReadinessProbe />
      </EvmWalletContext>,
    );

  await act(async () => render());
  expect(observedReadiness.at(-1)).toBe(false);

  mockMultiProvider = { version: 1 };
  await act(async () => render());
  const readyConfig = observedConfigs.at(-1);
  expect(observedReadiness.at(-1)).toBe(true);

  mockMultiProvider = { version: 2 };
  await act(async () => render());
  expect(observedConfigs.at(-1)).toBe(readyConfig);
  expect(mockCreateConfig).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
});
