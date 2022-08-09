import type { NextPage } from 'next';

import { ContentFrame } from '../../components/nav/ContentFrame';
import { TransferForm } from '../../features/transfer/TransferForm';

const TransferHome: NextPage = () => {
  return (
    <ContentFrame>
      <TransferForm />
    </ContentFrame>
  );
};

export default TransferHome;
