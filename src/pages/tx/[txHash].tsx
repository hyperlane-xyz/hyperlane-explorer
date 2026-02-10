import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { logger } from '../../utils/logger';

const TransactionDetails = dynamic(
  () =>
    import('../../features/transactions/TransactionDetails').then((mod) => mod.TransactionDetails),
  { ssr: false },
);

const TransactionPage: NextPage = () => {
  const router = useRouter();
  const { txHash } = router.query;

  useEffect(() => {
    // Only redirect after router is ready and txHash is confirmed missing/invalid
    if (router.isReady && (!txHash || typeof txHash !== 'string')) {
      router.replace('/').catch((e) => logger.error('Error routing back to home', e));
    }
  }, [router, router.isReady, txHash]);

  // Render nothing while waiting for client-side router to be ready
  if (!router.isReady || !txHash || typeof txHash !== 'string') {
    return null;
  }

  return <TransactionDetails txHash={txHash} />;
};

export default TransactionPage;
