import type { NextPage } from 'next';

import { ContentFrame } from '../components/layout/ContentFrame';
import { MessageSearch } from '../features/messages/MessageSearch';

const HomePage: NextPage = () => {
  return (
    <ContentFrame>
      <MessageSearch />
    </ContentFrame>
  );
};

// Required for dynamic routing to work by disabling Automatic Static Optimization
export function getServerSideProps() {
  return {
    props: {},
  };
}

export default HomePage;
