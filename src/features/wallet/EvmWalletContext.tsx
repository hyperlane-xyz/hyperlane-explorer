import { getWagmiChainConfigs } from '@hyperlane-xyz/widgets/walletIntegrations/ethereum';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { injected } from '@wagmi/connectors';
import { PropsWithChildren, useMemo } from 'react';
import { WagmiProvider, createConfig, fallback, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';

import { config } from '../../consts/config';
import { useMultiProvider } from '../../store';

const APP_NAME = 'Hyperlane Explorer';

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

function initWagmiConfig(multiProvider: ReturnType<typeof useMultiProvider> | null) {
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
  const multiProvider = useMultiProvider();

  const wagmiConfig = useMemo(() => {
    return initWagmiConfig(multiProvider.getKnownChainNames().length ? multiProvider : null);
  }, [multiProvider]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>{children}</RainbowKitProvider>
    </WagmiProvider>
  );
}
