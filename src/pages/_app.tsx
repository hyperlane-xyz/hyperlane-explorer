import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';

import 'react-toastify/dist/ReactToastify.css';
import {
  Provider as UrqlProvider,
  cacheExchange,
  createClient as createUrqlClient,
  fetchExchange,
} from 'urql';

import '@hyperlane-xyz/widgets/styles.css';
import { AppLayout } from '../AppLayout';
import { AppErrorBoundary } from '../components/errors/AppErrorBoundary';
import { config } from '../consts/config';
import { useScrapedDomainsStore } from '../features/chains/queries/scrapedDomainsStore';
import { MessageDetailsLoading } from '../features/messages/MessageDetailsLoading';
import {
  ExplorerEventsProvider,
  shouldEnableExplorerEvents,
} from '../features/messages/queries/ExplorerEventsProvider';

import '../styles/global.css';

const AppClientOverlays = dynamic(
  () => import('../components/AppClientOverlays').then((mod) => mod.AppClientOverlays),
  { ssr: false },
);

const urqlClient = createUrqlClient({
  url: config.apiUrl,
  exchanges: [cacheExchange, fetchExchange],
  preferGetMethod: false,
});

const reactQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App({ Component, router, pageProps }: AppProps) {
  const [isMessageRoutePending, setIsMessageRoutePending] = useState(false);
  const scrapedDomains = useScrapedDomainsStore((state) => state.scrapedDomains);
  const scrapedDomainIds = useMemo(
    () => scrapedDomains.filter((domain) => !domain.is_test_net).map(({ id }) => id),
    [scrapedDomains],
  );
  const diagnosticsMessageId =
    isMessageRoute(router.pathname) && typeof router.query.messageId === 'string'
      ? router.query.messageId
      : undefined;

  const onRouteChangeStart = useCallback((url: string) => {
    setIsMessageRoutePending(isMessageRoute(url));
  }, []);

  const onRouteChangeEnd = useCallback(() => {
    setIsMessageRoutePending(false);
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

  return (
    <div className="font-sans text-black">
      <AppErrorBoundary>
        <QueryClientProvider client={reactQueryClient}>
          <UrqlProvider value={urqlClient}>
            <ExplorerEventsProvider
              domains={scrapedDomainIds}
              diagnosticsMessageId={diagnosticsMessageId}
              enabled={shouldEnableExplorerEvents(router.pathname)}
            >
              <AppLayout pathName={router.pathname}>
                {isMessageRoutePending ? <MessageDetailsLoading /> : <Component {...pageProps} />}
              </AppLayout>
            </ExplorerEventsProvider>
          </UrqlProvider>
        </QueryClientProvider>
        <AppClientOverlays />
      </AppErrorBoundary>
    </div>
  );
}

function isMessageRoute(pathName: string) {
  return pathName === '/message/[messageId]' || pathName.startsWith('/message/');
}
