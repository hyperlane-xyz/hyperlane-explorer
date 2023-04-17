import type { NextPage } from 'next';

import { ContentFrame } from '../components/layout/ContentFrame';
import { TxDebugger } from '../features/debugger/TxDebugger';

const DebuggerPage: NextPage = () => {
  return (
    <ContentFrame>
      <TxDebugger />
    </ContentFrame>
  );
};

// Required for dynamic routing to work by disabling Automatic Static Optimization
export function getServerSideProps() {
  return {
    props: {},
  };
}

export default DebuggerPage;
