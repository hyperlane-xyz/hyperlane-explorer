import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import { ToastContainer, Zoom, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Tooltip } from 'react-tooltip';
import { Provider as UrqlProvider, createClient as createUrqlClient } from 'urql';

import '@hyperlane-xyz/widgets/styles.css';

import { AppLayout } from '../AppLayout';
import { ErrorBoundary } from '../components/errors/ErrorBoundary';
import { config } from '../consts/config';
import { ChainConfigSyncer } from '../features/chains/ChainConfigSyncer';
import { MAIN_FONT } from '../styles/fonts';
import '../styles/global.css';
import { useIsSsr } from '../utils/ssr';

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
        <ToastContainer transition={Zoom} position={toast.POSITION.BOTTOM_RIGHT} limit={2} />
        <Tooltip id="root-tooltip" className="z-50" />
      </ErrorBoundary>
    </div>
  );
}
