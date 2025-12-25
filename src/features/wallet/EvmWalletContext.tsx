'use client';

import { getWagmiChainConfigs } from '@hyperlane-xyz/widgets';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { PropsWithChildren, useMemo } from 'react';
import { WagmiProvider, createConfig, fallback, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { config } from '../../consts/config';
import { useMultiProvider } from '../../store';

const APP_NAME = 'Hyperlane Explorer';

function initWagmiConfig(multiProvider: ReturnType<typeof useMultiProvider> | null) {
  const chains = multiProvider ? getWagmiChainConfigs(multiProvider) : [];

  // Use mainnet as fallback when no chains are loaded yet
  const effectiveChains = chains.length > 0 ? chains : [mainnet];

  const connectors = connectorsForWallets(
    [
      {
        groupName: 'Recommended',
        wallets: [metaMaskWallet, rainbowWallet, walletConnectWallet, injectedWallet],
      },
    ],
    {
      appName: APP_NAME,
      projectId: config.walletConnectProjectId,
    },
  );

  const wagmiConfig = createConfig({
    chains: [effectiveChains[0], ...effectiveChains.slice(1)],
    connectors,
    transports: effectiveChains.reduce(
      (acc, chain) => {
        const httpTransports = chain.rpcUrls.default.http.map((url) => http(url));
        acc[chain.id] = fallback(httpTransports);
        return acc;
      },
      {} as Record<number, ReturnType<typeof fallback>>,
    ),
    ssr: false,
  });

  return { wagmiConfig, chains: effectiveChains };
}

export function EvmWalletContext({ children }: PropsWithChildren) {
  const multiProvider = useMultiProvider();

  const { wagmiConfig } = useMemo(() => {
    const chainNames = multiProvider.getKnownChainNames();
    return initWagmiConfig(chainNames.length ? multiProvider : null);
  }, [multiProvider]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>{children}</RainbowKitProvider>
    </WagmiProvider>
  );
}
