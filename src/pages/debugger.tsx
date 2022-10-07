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

// Required for dynamic routing to work by disabling Automatic Static Optimization
export async function getServerSideProps() {
  return {
    props: {},
  };
}

export default Debugger;
