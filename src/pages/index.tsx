import type { NextPage } from 'next';

import { MessageSearch } from '../features/messages/MessageSearch';

const HomePage: NextPage = () => {
  return <MessageSearch />;
};

// Required for dynamic routing to work by disabling Automatic Static Optimization
export function getServerSideProps() {
  return {
    props: {},
  };
}

export default HomePage;
