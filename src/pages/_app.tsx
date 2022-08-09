import {
  RainbowKitProvider,
  getDefaultWallets,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import type { AppProps } from 'next/app';
import { ToastContainer, Zoom, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { WagmiConfig, configureChains, createClient } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';

import { ErrorBoundary } from '../components/errors/ErrorBoundary';
import { AppLayout } from '../components/layout/AppLayout';
import { config } from '../consts/appConfig';
import { prodChains } from '../consts/networksConfig';
import { Color } from '../styles/Color';
import '../styles/fonts.css';
import '../styles/globals.css';

const { chains, provider } = configureChains(prodChains, [publicProvider()]);

const { connectors } = getDefaultWallets({
  appName: config.name,
  chains,
});

const client = createClient({
  autoConnect: true,
  provider,
  connectors,
});

export default function App({ Component, router, pageProps }: AppProps) {
  const pathName = router.pathname;
  return (
    <ErrorBoundary>
      <WagmiConfig client={client}>
        <RainbowKitProvider
          chains={chains}
          theme={lightTheme({
            accentColor: Color.primaryRed,
            borderRadius: 'small',
            fontStack: 'system',
          })}
        >
          <AppLayout pathName={pathName}>
            <Component {...pageProps} />
          </AppLayout>
        </RainbowKitProvider>
        <ToastContainer
          transition={Zoom}
          position={toast.POSITION.BOTTOM_RIGHT}
        />
      </WagmiConfig>
    </ErrorBoundary>
  );
}
