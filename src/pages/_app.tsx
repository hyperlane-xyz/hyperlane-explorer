// import {
//   RainbowKitProvider,
//   connectorsForWallets,
//   lightTheme,
//   wallet,
// } from '@rainbow-me/rainbowkit';
// import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import { ToastContainer, Zoom, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Tooltip } from 'react-tooltip';
import { Provider as UrqlProvider, createClient as createUrqlClient } from 'urql';

import '@hyperlane-xyz/widgets/styles.css';

// import { WagmiConfig, configureChains, createClient as createWagmiClient } from 'wagmi';
// import { publicProvider } from 'wagmi/providers/public';
import { ErrorBoundary } from '../components/errors/ErrorBoundary';
import { AppLayout } from '../components/layout/AppLayout';
import { config } from '../consts/config';
import { ChainConfigSyncer } from '../features/chains/ChainConfigSyncer';
import '../styles/fonts.css';
import '../styles/global.css';
import { useIsSsr } from '../utils/ssr';

// const { chains, provider } = configureChains(prodAndTestChains, [publicProvider()]);

// const connectors = connectorsForWallets([
//   {
//     groupName: 'Recommended',
//     wallets: [
//       wallet.metaMask({ chains }),
//       wallet.walletConnect({ chains }),
//       wallet.rainbow({ chains }),
//       wallet.steak({ chains }),
//     ],
//   },
// ]);

// const wagmiClient = createWagmiClient({
//   autoConnect: false, // TODO
//   provider,
//   connectors,
// });

const urqlClient = createUrqlClient({
  url: config.apiUrl,
});

const reactQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App({ Component, router, pageProps }: AppProps) {
  // Disable app SSR for now as it's not needed and
  // complicates graphql integration
  const isSsr = useIsSsr();
  if (isSsr) {
    return <div></div>;
  }

  return (
    <ErrorBoundary>
      {/* <WagmiConfig client={wagmiClient}> */}
      {/* <RainbowKitProvider
          chains={chains}
          theme={lightTheme({
            accentColor: Color.primaryRed,
            borderRadius: 'small',
            fontStack: 'system',
          })}
        > */}
      <QueryClientProvider client={reactQueryClient}>
        <UrqlProvider value={urqlClient}>
          <ChainConfigSyncer>
            <AppLayout pathName={router.pathname}>
              <Component {...pageProps} />
            </AppLayout>
          </ChainConfigSyncer>
        </UrqlProvider>
      </QueryClientProvider>
      <ToastContainer transition={Zoom} position={toast.POSITION.BOTTOM_RIGHT} limit={2} />
      <Tooltip id="root-tooltip" className="z-50" />
      {/* </RainbowKitProvider> */}
      {/* </WagmiConfig> */}
    </ErrorBoundary>
  );
}
