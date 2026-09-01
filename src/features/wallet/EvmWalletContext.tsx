import { getWagmiChainConfigs } from '@hyperlane-xyz/widgets/walletIntegrations/ethereum';
import { RainbowKitProvider, connectorsForWallets, lightTheme } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { injected } from '@wagmi/core';
import { PropsWithChildren, createContext, useContext, useEffect, useState } from 'react';
import { createClient, fallback, http } from 'viem';
import { mainnet } from 'viem/chains';
import { WagmiProvider, createConfig } from 'wagmi';

import { APP_NAME } from '../../consts/appMetadata';
import { config } from '../../consts/config';
import { useReadyMultiProvider } from '../../store';
import { Color } from '../../styles/Color';

const WalletReadyContext = createContext(false);

export function getConnectors(walletConnectProjectId?: string) {
  if (!walletConnectProjectId) return [injected()];

  return connectorsForWallets(
    [
      {
        groupName: 'Recommended',
        wallets: [metaMaskWallet, injectedWallet, rainbowWallet, walletConnectWallet],
      },
    ],
    { appName: APP_NAME, projectId: walletConnectProjectId },
  );
}

function createWagmiConfig(multiProvider?: NonNullable<ReturnType<typeof useReadyMultiProvider>>) {
  const configuredChains = multiProvider ? getWagmiChainConfigs(multiProvider) : [];
  const chains = configuredChains.length ? configuredChains : [mainnet];

  return createConfig({
    chains: [chains[0], ...chains.slice(1)],
    connectors: getConnectors(config.walletConnectProjectId),
    client({ chain }) {
      const transport = fallback(chain.rpcUrls.default.http.map((url) => http(url)));
      return createClient({ chain, transport });
    },
  });
}

export function EvmWalletContext({ children }: PropsWithChildren) {
  const multiProvider = useReadyMultiProvider();
  const [walletState, setWalletState] = useState(() => ({
    wagmiConfig: createWagmiConfig(multiProvider),
    isReady: !!multiProvider,
  }));

  useEffect(() => {
    if (!multiProvider || walletState.isReady) return;
    setWalletState({ wagmiConfig: createWagmiConfig(multiProvider), isReady: true });
  }, [multiProvider, walletState.isReady]);

  return (
    <WagmiProvider config={walletState.wagmiConfig}>
      <RainbowKitProvider
        theme={lightTheme({
          accentColor: Color.primary,
          borderRadius: 'small',
          fontStack: 'system',
        })}
      >
        <WalletReadyContext.Provider value={walletState.isReady}>
          {children}
        </WalletReadyContext.Provider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

export function useIsWalletReady() {
  return useContext(WalletReadyContext);
}
