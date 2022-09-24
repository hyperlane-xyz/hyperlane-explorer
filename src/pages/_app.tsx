import {
  RainbowKitProvider,
  connectorsForWallets,
  lightTheme,
  wallet,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import type { AppProps } from 'next/app';
import { ToastContainer, Zoom, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Client, Provider as UrqlProvider, createClient as createUrqlClient } from 'urql';
import { WagmiConfig, configureChains, createClient as createWagmiClient } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';

import { ErrorBoundary } from '../components/errors/ErrorBoundary';
import { AppLayout } from '../components/layout/AppLayout';
import { configs } from '../consts/appConfig';
import { Environment } from '../consts/environments';
import { prodChains } from '../consts/networksConfig';
import { useStore } from '../store';
import { Color } from '../styles/Color';
import '../styles/fonts.css';
import '../styles/globals.css';
import { useIsSsr } from '../utils/ssr';

const { chains, provider } = configureChains(prodChains, [publicProvider()]);

const connectors = connectorsForWallets([
  {
    groupName: 'Recommended',
    wallets: [
      wallet.metaMask({ chains }),
      wallet.walletConnect({ chains }),
      wallet.rainbow({ chains }),
      wallet.steak({ chains }),
    ],
  },
]);

const wagmiClient = createWagmiClient({
  autoConnect: true,
  provider,
  connectors,
});

const urqlClients: Record<Environment, Client> = {
  [Environment.Mainnet]: createUrqlClient({
    url: configs.mainnet.apiUrl,
  }),
  [Environment.Testnet2]: createUrqlClient({
    url: configs.testnet2.apiUrl,
  }),
};

export default function App({ Component, router, pageProps }: AppProps) {
  const environment = useStore((s) => s.environment);

  // Disable app SSR for now as it's not needed and
  // complicates graphql integration
  const isSsr = useIsSsr();
  if (isSsr) {
    return <div></div>;
  }

  const pathName = router.pathname;
  return (
    <ErrorBoundary>
      <WagmiConfig client={wagmiClient}>
        <RainbowKitProvider
          chains={chains}
          theme={lightTheme({
            accentColor: Color.primaryRed,
            borderRadius: 'small',
            fontStack: 'system',
          })}
        >
          <UrqlProvider value={urqlClients[environment]}>
            <AppLayout pathName={pathName}>
              <Component {...pageProps} />
            </AppLayout>
          </UrqlProvider>
        </RainbowKitProvider>
        <ToastContainer transition={Zoom} position={toast.POSITION.BOTTOM_RIGHT} limit={2} />
      </WagmiConfig>
    </ErrorBoundary>
  );
}
