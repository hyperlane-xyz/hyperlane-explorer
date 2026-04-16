import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import 'react-toastify/dist/ReactToastify.css';
import { Provider as UrqlProvider, createClient as createUrqlClient } from 'urql';

import '@hyperlane-xyz/widgets/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import { AppLayout } from '../AppLayout';
import { AppErrorBoundary } from '../components/errors/AppErrorBoundary';
import { AppLoadingShell } from '../components/layout/AppLoadingShell';
import { config } from '../consts/config';
import { MessageDetailsLoading } from '../features/messages/MessageDetailsLoading';
import { MessageSearchLoading } from '../features/messages/MessageSearchLoading';
import { EvmWalletContext } from '../features/wallet/EvmWalletContext';

import '../styles/global.css';

const AppClientOverlays = dynamic(
  () => import('../components/AppClientOverlays').then((mod) => mod.AppClientOverlays),
  { ssr: false },
);

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

// Simple SSR check hook to avoid importing from @hyperlane-xyz/widgets during SSR
// which triggers pino-pretty initialization
function useIsSsr() {
  const [isSsr, setIsSsr] = useState(true);
  useEffect(() => {
    setIsSsr(false);
  }, []);
  return isSsr;
}

export default function App({ Component, router, pageProps }: AppProps) {
  // Disable app SSR for now as it's not needed and
  // complicates graphql integration. However, we still need to render
  // the page's Head component for OG meta tags to work with social crawlers.
  const isSsr = useIsSsr();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const onRouteChangeStart = useCallback((url: string) => {
    setPendingRoute(isMessageRoute(url) ? url : null);
  }, []);

  const onRouteChangeEnd = useCallback(() => {
    setPendingRoute(null);
  }, []);

  useEffect(() => {
    router.events.on('routeChangeStart', onRouteChangeStart);
    router.events.on('routeChangeComplete', onRouteChangeEnd);
    router.events.on('routeChangeError', onRouteChangeEnd);

    return () => {
      router.events.off('routeChangeStart', onRouteChangeStart);
      router.events.off('routeChangeComplete', onRouteChangeEnd);
      router.events.off('routeChangeError', onRouteChangeEnd);
    };
  }, [onRouteChangeEnd, onRouteChangeStart, router.events]);

  // Note, the font definition is required both here and in _document.tsx
  // Otherwise Next.js will not load the font

  // During SSR, render the page component with providers for its Head/meta tags
  // but hide body content to avoid flash of unstyled content.
  // The Component is rendered (for Head/OG tags) but visually hidden.
  if (isSsr) {
    return (
      <div className="font-sans text-black">
        {/* Render page component hidden during SSR so its <Head> OG tags are emitted for crawlers */}
        <div className="hidden" aria-hidden="true">
          <QueryClientProvider client={reactQueryClient}>
            <UrqlProvider value={urqlClient}>
              <Component {...pageProps} />
            </UrqlProvider>
          </QueryClientProvider>
        </div>
        <AppLoadingShell>{getSsrLoadingContent(router.pathname)}</AppLoadingShell>
      </div>
    );
  }

  const appContent = (
    <QueryClientProvider client={reactQueryClient}>
      <EvmWalletContext>
        <UrqlProvider value={urqlClient}>
          <AppLayout pathName={router.pathname}>
            {pendingRoute ? (
              getRouteLoadingContent(pendingRoute) || <Component {...pageProps} />
            ) : (
              <Component {...pageProps} />
            )}
          </AppLayout>
        </UrqlProvider>
      </EvmWalletContext>
    </QueryClientProvider>
  );

  return (
    <div className="font-sans text-black">
      <AppErrorBoundary>
        {appContent}
        <AppClientOverlays />
      </AppErrorBoundary>
    </div>
  );
}

function getSsrLoadingContent(pathName: string) {
  if (pathName === '/') return <MessageSearchLoading />;
  if (isMessageRoute(pathName)) return <MessageDetailsLoading />;
  return <div className="min-h-[20rem]" />;
}

function getRouteLoadingContent(pathName: string) {
  if (isMessageRoute(pathName)) return <MessageDetailsLoading />;
  return null;
}

function isMessageRoute(pathName: string) {
  return pathName === '/message/[messageId]' || pathName.startsWith('/message/');
}
