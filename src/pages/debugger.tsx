import type { NextPage } from 'next';

import { ContentFrame } from '../components/layout/ContentFrame';
import { TxDebugger } from '../features/debugger/TxDebugger';

const Debugger: NextPage = () => {
  return (
    <ContentFrame>
      <TxDebugger />
    </ContentFrame>
  );
};

export default Debugger;
