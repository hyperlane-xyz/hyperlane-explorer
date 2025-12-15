import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { ToastContainer, Zoom } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Tooltip } from 'react-tooltip';
import { Provider as UrqlProvider, createClient as createUrqlClient } from 'urql';

import '@hyperlane-xyz/widgets/styles.css';

import { useIsSsr } from '@hyperlane-xyz/widgets';
import { AppLayout } from '../AppLayout';
import { ErrorBoundary } from '../components/errors/ErrorBoundary';
import { config } from '../consts/config';
import { links } from '../consts/links';
import { ChainConfigSyncer } from '../features/chains/ChainConfigSyncer';
import { MAIN_FONT } from '../styles/fonts';
import '../styles/global.css';

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

  // Note, the font definition is required both here and in _document.tsx
  // Otherwise Next.js will not load the font
  return (
    <div className={`${MAIN_FONT.variable} font-sans text-black`}>
      <Head>
        <title>Hyperlane Explorer</title>
        <meta name="description" content="The interchain explorer for the Hyperlane protocol." />

        {/* Open Graph */}
        <meta property="og:url" content={links.baseUrl} />
        <meta property="og:title" content="Hyperlane Explorer" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${links.baseUrl}/images/logo.png`} />
        <meta property="og:description" content="The interchain explorer for the Hyperlane protocol." />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Hyperlane Explorer" />
        <meta name="twitter:description" content="The interchain explorer for the Hyperlane protocol." />
        <meta name="twitter:image" content={`${links.baseUrl}/images/logo.png`} />
      </Head>
      <ErrorBoundary>
        <QueryClientProvider client={reactQueryClient}>
          <UrqlProvider value={urqlClient}>
            <ChainConfigSyncer>
              <AppLayout pathName={router.pathname}>
                <Component {...pageProps} />
              </AppLayout>
            </ChainConfigSyncer>
          </UrqlProvider>
        </QueryClientProvider>
        <ToastContainer transition={Zoom} position="bottom-right" limit={2} />
        <Tooltip id="root-tooltip" className="z-50" />
      </ErrorBoundary>
    </div>
  );
}
