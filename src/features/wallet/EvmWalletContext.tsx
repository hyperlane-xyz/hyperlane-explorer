import { getWagmiChainConfigs } from '@hyperlane-xyz/widgets/walletIntegrations/ethereum';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { injected } from '@wagmi/connectors';
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { WagmiProvider, createConfig, fallback, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';

import { config } from '../../consts/config';
import { useReadyMultiProvider } from '../../store';

const APP_NAME = 'Hyperlane Explorer';
const WalletReadyContext = createContext(false);

function getConnectors(walletConnectProjectId?: string) {
  if (!walletConnectProjectId) return [injected()];

  return connectorsForWallets(
    [
      {
        groupName: 'Recommended',
        wallets: [metaMaskWallet, rainbowWallet, walletConnectWallet, injectedWallet],
      },
    ],
    {
      appName: APP_NAME,
      projectId: walletConnectProjectId,
    },
  );
}

function initWagmiConfig(multiProvider: ReturnType<typeof useReadyMultiProvider> | null) {
  const chains = multiProvider ? getWagmiChainConfigs(multiProvider) : [];
  const effectiveChains = chains.length ? chains : [mainnet];

  return createConfig({
    chains: [effectiveChains[0], ...effectiveChains.slice(1)],
    connectors: getConnectors(config.walletConnectProjectId),
    ssr: false,
    transports: effectiveChains.reduce(
      (result, chain) => {
        result[chain.id] = fallback(chain.rpcUrls.default.http.map((url) => http(url)));
        return result;
      },
      {} as Record<number, ReturnType<typeof fallback>>,
    ),
  });
}

export function EvmWalletContext({ children }: PropsWithChildren) {
  const multiProvider = useReadyMultiProvider();
  const [wagmiConfig, setWagmiConfig] = useState(() => initWagmiConfig(null));
  const [isWalletReady, setIsWalletReady] = useState(false);

  useEffect(() => {
    if (!multiProvider || isWalletReady) return;
    setWagmiConfig(initWagmiConfig(multiProvider));
    setIsWalletReady(true);
  }, [isWalletReady, multiProvider]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>
        <WalletReadyContext.Provider value={isWalletReady}>
          {children}
        </WalletReadyContext.Provider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

export function useIsWalletReady() {
  return useContext(WalletReadyContext);
}
