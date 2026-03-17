import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import 'react-toastify/dist/ReactToastify.css';
import { Provider as UrqlProvider, createClient as createUrqlClient } from 'urql';

import '@hyperlane-xyz/widgets/styles.css';

import { AppLayout } from '../AppLayout';
import { AppLoadingShell } from '../components/layout/AppLoadingShell';
import { OGHead } from '../components/OGHead';
import { config } from '../consts/config';
import { links } from '../consts/links';
import { MessageDetailsLoading } from '../features/messages/MessageDetailsLoading';
import { MessageSearchLoading } from '../features/messages/MessageSearchLoading';
import '../styles/global.css';

// Dynamic import ErrorBoundary to avoid pino-pretty issues during SSR
const ErrorBoundary = dynamic(
  () => import('../components/errors/ErrorBoundary').then((mod) => mod.ErrorBoundary),
  { ssr: false },
);
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

  // Note, the font definition is required both here and in _document.tsx
  // Otherwise Next.js will not load the font

  // During SSR, render the page component with providers for its Head/meta tags
  // but hide body content to avoid flash of unstyled content.
  // The Component is rendered (for Head/OG tags) but visually hidden.
  if (isSsr) {
    return (
      <div className="font-sans text-black">
        <OGHead
          url={links.explorerUrl}
          image={`${links.explorerUrl}/images/logo.png`}
          logoUrl={`${links.explorerUrl}/images/logo.png`}
        />
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

  return (
    <div className="font-sans text-black">
      <OGHead
        url={links.explorerUrl}
        image={`${links.explorerUrl}/images/logo.png`}
        logoUrl={`${links.explorerUrl}/images/logo.png`}
      />
      <ErrorBoundary>
        <QueryClientProvider client={reactQueryClient}>
          <UrqlProvider value={urqlClient}>
            <AppLayout pathName={router.pathname}>
              <Component {...pageProps} />
            </AppLayout>
          </UrqlProvider>
        </QueryClientProvider>
        <AppClientOverlays />
      </ErrorBoundary>
    </div>
  );
}

function getSsrLoadingContent(pathName: string) {
  if (pathName === '/') return <MessageSearchLoading />;
  if (pathName === '/message/[messageId]') return <MessageDetailsLoading />;
  return <div className="min-h-[20rem]" />;
}
