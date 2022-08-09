import type { NextPage } from 'next';

import { ContentFrame } from '../../components/nav/ContentFrame';
import { TransferReview } from '../../features/transfer/TransferReview';

const TransferReviewPage: NextPage = () => {
  return (
    <ContentFrame>
      <TransferReview />
    </ContentFrame>
  );
};

export default TransferReviewPage;
