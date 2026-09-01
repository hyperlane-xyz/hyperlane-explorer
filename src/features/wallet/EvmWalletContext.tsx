import { getWagmiChainConfigs } from '@hyperlane-xyz/widgets/walletIntegrations/ethereum';
import { RainbowKitProvider, connectorsForWallets, lightTheme } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { PropsWithChildren, useMemo } from 'react';
import { createClient, fallback, http } from 'viem';
import { mainnet } from 'viem/chains';
import { WagmiProvider, createConfig } from 'wagmi';

import { APP_NAME } from '../../consts/appMetadata';
import { config } from '../../consts/config';
import { useMultiProvider } from '../../store';
import { Color } from '../../styles/Color';

function createWagmiConfig(multiProvider: ReturnType<typeof useMultiProvider>) {
  const configuredChains = getWagmiChainConfigs(multiProvider);
  const chains = configuredChains.length ? configuredChains : [mainnet];
  const connectors = connectorsForWallets(
    [
      {
        groupName: 'Recommended',
        wallets: [metaMaskWallet, injectedWallet, rainbowWallet, walletConnectWallet],
      },
    ],
    { appName: APP_NAME, projectId: config.walletConnectProjectId },
  );

  return createConfig({
    chains: [chains[0], ...chains.slice(1)],
    connectors,
    client({ chain }) {
      const transport = fallback(chain.rpcUrls.default.http.map((url) => http(url)));
      return createClient({ chain, transport });
    },
  });
}

export function EvmWalletContext({ children }: PropsWithChildren) {
  const multiProvider = useMultiProvider();
  const wagmiConfig = useMemo(() => createWagmiConfig(multiProvider), [multiProvider]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={lightTheme({
          accentColor: Color.primary,
          borderRadius: 'small',
          fontStack: 'system',
        })}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
